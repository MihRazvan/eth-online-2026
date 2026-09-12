//! Typed, permissionless pool-history context. This output has no settlement authority.
use std::collections::{BTreeMap, BTreeSet};
use substreams::errors::Error;
use substreams_ethereum_core::pb::eth::v2::Block;

pub mod upstream {
    include!(concat!(env!("OUT_DIR"), "/uniswap.v4.rs"));
}
pub mod context {
    include!(concat!(env!("OUT_DIR"), "/feestrip.context.v1.rs"));
}
use context::{LiquidityChange, PoolContextBlock, PoolInitialized, Swap};

#[derive(Debug)]
struct Config {
    chain_id: u64,
    manager: String,
    pools: BTreeSet<String>,
}
fn hex_value(value: &str, bytes: usize) -> Result<String, Error> {
    let clean = value.strip_prefix("0x").unwrap_or(value);
    if clean.len() != bytes * 2 || !clean.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(Error::msg("invalid fixed-width hex value"));
    }
    Ok(format!("0x{}", clean.to_ascii_lowercase()))
}
impl Config {
    fn parse(params: &str) -> Result<Self, Error> {
        let mut chain = None;
        let mut manager = None;
        let mut pools = None;
        for part in params.split('&') {
            let (k, v) = part
                .split_once('=')
                .ok_or_else(|| Error::msg("expected key=value params"))?;
            match k {
                "chain_id" if chain.is_none() => chain = Some(v.parse::<u64>()?),
                "pool_manager" if manager.is_none() => manager = Some(hex_value(v, 20)?),
                "pool_ids" if pools.is_none() => {
                    pools = Some(if v == "*" {
                        BTreeSet::new()
                    } else {
                        v.split(',')
                            .map(|p| hex_value(p, 32))
                            .collect::<Result<_, _>>()?
                    });
                }
                _ => return Err(Error::msg("unknown or duplicate context parameter")),
            }
        }
        let chain_id = chain.ok_or_else(|| Error::msg("chain_id required"))?;
        if chain_id == 0 || chain_id > 9_007_199_254_740_991 {
            return Err(Error::msg("invalid chain_id"));
        }
        Ok(Self {
            chain_id,
            manager: manager.ok_or_else(|| Error::msg("pool_manager required"))?,
            pools: pools
                .ok_or_else(|| Error::msg("pool_ids required; use * explicitly for all"))?,
        })
    }
    fn selected(&self, manager: &str, pool: &str) -> Result<Option<String>, Error> {
        if hex_value(manager, 20)? != self.manager {
            return Ok(None);
        }
        let pool = hex_value(pool, 32)?;
        Ok((self.pools.is_empty() || self.pools.contains(&pool)).then_some(pool))
    }
}
fn tick(v: &str) -> Result<i32, Error> {
    let n = v.parse::<i32>()?;
    if !(-887272..=887272).contains(&n) {
        return Err(Error::msg("tick outside v4 bounds"));
    }
    Ok(n)
}
fn decimal(v: String, signed: bool) -> Result<String, Error> {
    let digits = if signed {
        v.strip_prefix('-').unwrap_or(&v)
    } else {
        &v
    };
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(Error::msg("invalid integer amount"));
    }
    Ok(v)
}
fn same_block(actual: u64, expected: u64) -> Result<(), Error> {
    if actual != expected {
        return Err(Error::msg("upstream event/clock mismatch"));
    }
    Ok(())
}

/// The retained upstream decoder emits receipt `Log.index` (transaction-local).
/// Resolve it against the same full block's receipts, whose `block_index` is the
/// committed block-global index. Call-trace logs can be reverted and are not used.
struct ReceiptLogIndices {
    logs: BTreeMap<(String, u32), (u32, String)>,
}
impl ReceiptLogIndices {
    fn from_block(block: &Block) -> Result<Self, Error> {
        let mut logs = BTreeMap::new();
        let mut transactions = BTreeSet::new();
        let mut block_indices = BTreeSet::new();
        for transaction in &block.transaction_traces {
            let Some(receipt) = &transaction.receipt else {
                continue;
            };
            if receipt.logs.is_empty() {
                continue;
            }
            let hash = hex_value(&hex::encode(&transaction.hash), 32)?;
            if !transactions.insert(hash.clone()) {
                return Err(Error::msg("ambiguous receipt transaction hash"));
            }
            for log in &receipt.logs {
                let address = hex_value(&hex::encode(&log.address), 20)?;
                if logs
                    .insert((hash.clone(), log.index), (log.block_index, address))
                    .is_some()
                    || !block_indices.insert(log.block_index)
                {
                    return Err(Error::msg("ambiguous receipt log index"));
                }
            }
        }
        Ok(Self { logs })
    }
    fn resolve(
        &self,
        transaction_hash: &str,
        local_index: u32,
        manager: &str,
    ) -> Result<u32, Error> {
        let key = (hex_value(transaction_hash, 32)?, local_index);
        let (block_index, address) = self
            .logs
            .get(&key)
            .ok_or_else(|| Error::msg("upstream event receipt log missing"))?;
        if address != &hex_value(manager, 20)? {
            return Err(Error::msg("upstream event receipt address mismatch"));
        }
        Ok(*block_index)
    }
}

#[substreams::handlers::map]
pub fn map_pool_context(
    params: String,
    events: upstream::Events,
    block: Block,
) -> Result<PoolContextBlock, Error> {
    transform(&params, events, block)
}

pub fn transform(
    params: &str,
    events: upstream::Events,
    block: Block,
) -> Result<PoolContextBlock, Error> {
    let config = Config::parse(params)?;
    let receipt_indices = ReceiptLogIndices::from_block(&block)?;
    let header = block
        .header
        .ok_or_else(|| Error::msg("missing block header"))?;
    let timestamp = header
        .timestamp
        .ok_or_else(|| Error::msg("missing timestamp"))?;
    if timestamp.seconds < 0 || block.hash.len() != 32 || header.parent_hash.len() != 32 {
        return Err(Error::msg("invalid block metadata"));
    }
    let mut out = PoolContextBlock {
        chain_id: config.chain_id,
        pool_manager: config.manager.clone(),
        number: block.number,
        hash: format!("0x{}", hex::encode(block.hash)),
        parent_hash: format!("0x{}", hex::encode(header.parent_hash)),
        timestamp: timestamp.seconds as u64,
        donations_included: false,
        allocation_authority: "contract-only".into(),
        ..Default::default()
    };
    for e in events.initialize_events {
        if let Some(pool_id) = config.selected(&e.contract, &e.pool_id)? {
            same_block(e.block_number, block.number)?;
            out.initialized.push(PoolInitialized {
                pool_id,
                currency0: hex_value(&e.currency0, 20)?,
                currency1: hex_value(&e.currency1, 20)?,
                hooks: hex_value(&e.hooks, 20)?,
                fee: e.fee.parse()?,
                tick_spacing: e.tick_spacing.parse()?,
                tick: tick(&e.tick)?,
                sqrt_price_x96: decimal(e.sqrt_price_x96, false)?,
                log_index: receipt_indices.resolve(
                    &e.transaction_hash,
                    e.log_index,
                    &e.contract,
                )?,
                transaction_hash: hex_value(&e.transaction_hash, 32)?,
            });
        }
    }
    for e in events.swap_events {
        if let Some(pool_id) = config.selected(&e.contract, &e.pool_id)? {
            same_block(e.block_number, block.number)?;
            out.swaps.push(Swap {
                pool_id,
                log_index: receipt_indices.resolve(
                    &e.transaction_hash,
                    e.log_index,
                    &e.contract,
                )?,
                transaction_hash: hex_value(&e.transaction_hash, 32)?,
                tick: tick(&e.tick)?,
                amount0: decimal(e.amount0, true)?,
                amount1: decimal(e.amount1, true)?,
                liquidity: decimal(e.liquidity, false)?,
                sqrt_price_x96: decimal(e.sqrt_price_x96, false)?,
                fee: e.fee.parse()?,
            });
        }
    }
    for e in events.modify_liquidity_events {
        if let Some(pool_id) = config.selected(&e.contract, &e.pool_id)? {
            same_block(e.block_number, block.number)?;
            let lower = tick(&e.tick_lower)?;
            let upper = tick(&e.tick_upper)?;
            if lower >= upper {
                return Err(Error::msg("invalid liquidity interval"));
            }
            out.liquidity_changes.push(LiquidityChange {
                pool_id,
                log_index: receipt_indices.resolve(
                    &e.transaction_hash,
                    e.log_index,
                    &e.contract,
                )?,
                transaction_hash: hex_value(&e.transaction_hash, 32)?,
                tick_lower: lower,
                tick_upper: upper,
                liquidity_delta: decimal(e.liquidity_delta, true)?,
                sender: hex_value(&e.sender, 20)?,
                salt: hex_value(&e.salt, 32)?,
            });
        }
    }
    out.initialized.sort_by_key(|e| e.log_index);
    out.swaps.sort_by_key(|e| e.log_index);
    out.liquidity_changes.sort_by_key(|e| e.log_index);
    let mut logs = BTreeSet::new();
    for index in out
        .initialized
        .iter()
        .map(|e| e.log_index)
        .chain(out.swaps.iter().map(|e| e.log_index))
        .chain(out.liquidity_changes.iter().map(|e| e.log_index))
    {
        if !logs.insert(index) {
            return Err(Error::msg("duplicate log index"));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use prost::Message;
    use substreams_ethereum_core::pb::eth::v2::{
        BlockHeader, Log, TransactionReceipt, TransactionTrace,
    };
    fn params() -> String {
        format!(
            "chain_id=11155111&pool_manager={}&pool_ids={}",
            "ab".repeat(20),
            "cd".repeat(32)
        )
    }
    fn block() -> Block {
        Block {
            number: 100,
            hash: vec![1; 32],
            header: Some(BlockHeader {
                parent_hash: vec![2; 32],
                timestamp: Some(prost_types::Timestamp {
                    seconds: 10,
                    nanos: 0,
                }),
                ..Default::default()
            }),
            transaction_traces: vec![trace(0xef, &[(0, 106), (1, 107), (2, 108)])],
            ..Default::default()
        }
    }
    fn trace(hash_byte: u8, indices: &[(u32, u32)]) -> TransactionTrace {
        TransactionTrace {
            hash: vec![hash_byte; 32],
            receipt: Some(TransactionReceipt {
                logs: indices
                    .iter()
                    .map(|&(index, block_index)| Log {
                        address: vec![0xab; 20],
                        index,
                        block_index,
                        ..Default::default()
                    })
                    .collect(),
                ..Default::default()
            }),
            ..Default::default()
        }
    }
    fn swap() -> upstream::SwapEvent {
        upstream::SwapEvent {
            block_number: 100,
            contract: "ab".repeat(20),
            pool_id: "cd".repeat(32),
            transaction_hash: "ef".repeat(32),
            tick: "-120".into(),
            amount0: "-340282366920938463463374607431768211455".into(),
            amount1: "999999999999999999999999999999".into(),
            liquidity: "1000000000000000000".into(),
            sqrt_price_x96: "79228162514264337593543950336".into(),
            fee: "3000".into(),
            ..Default::default()
        }
    }
    #[test]
    fn filters_pool_and_manager_without_losing_big_integers() {
        let a = swap();
        let mut b = swap();
        b.pool_id = "01".repeat(32);
        let mut c = swap();
        c.contract = "02".repeat(20);
        let out = transform(
            &params(),
            upstream::Events {
                swap_events: vec![a.clone(), b, c],
                ..Default::default()
            },
            block(),
        )
        .unwrap();
        assert_eq!(out.swaps.len(), 1);
        assert_eq!(out.swaps[0].amount0, a.amount0);
        assert_eq!(out.swaps[0].tick, -120);
        assert!(!out.donations_included);
        assert_eq!(out.allocation_authority, "contract-only");
        assert_eq!(
            PoolContextBlock::decode(out.encode_to_vec().as_slice()).unwrap(),
            out
        );
    }
    #[test]
    fn emits_empty_blocks_for_cursor_and_occupancy_continuity() {
        let out = transform(&params(), upstream::Events::default(), block()).unwrap();
        assert_eq!(out.number, 100);
        assert!(out.swaps.is_empty());
        assert_eq!(out.parent_hash, format!("0x{}", "02".repeat(32)));
    }
    #[test]
    fn rejects_bad_params_clock_and_ticks() {
        assert!(transform("chain_id=1", upstream::Events::default(), block()).is_err());
        let mut e = swap();
        e.block_number = 99;
        assert!(transform(
            &params(),
            upstream::Events {
                swap_events: vec![e],
                ..Default::default()
            },
            block()
        )
        .is_err());
        let mut e = swap();
        e.tick = "887273".into();
        assert!(transform(
            &params(),
            upstream::Events {
                swap_events: vec![e],
                ..Default::default()
            },
            block()
        )
        .is_err());
        assert!(Config::parse(&(params() + "&chain_id=1")).is_err());
    }
    #[test]
    fn preserves_log_order_and_rejects_duplicates() {
        let mut a = swap();
        a.log_index = 2;
        let mut b = swap();
        b.log_index = 1;
        let out = transform(
            &params(),
            upstream::Events {
                swap_events: vec![a, b],
                ..Default::default()
            },
            block(),
        )
        .unwrap();
        assert_eq!(out.swaps[0].log_index, 107);
        assert_eq!(out.swaps[1].log_index, 108);
        assert!(transform(
            &params(),
            upstream::Events {
                swap_events: vec![swap(), swap()],
                ..Default::default()
            },
            block()
        )
        .is_err());
    }
    #[test]
    fn preserves_initialization_and_signed_liquidity_context() {
        let init = upstream::InitializeEvent {
            block_number: 100,
            contract: "ab".repeat(20),
            pool_id: "cd".repeat(32),
            transaction_hash: "ef".repeat(32),
            currency0: "01".repeat(20),
            currency1: "02".repeat(20),
            hooks: "00".repeat(20),
            fee: "3000".into(),
            tick_spacing: "60".into(),
            tick: "0".into(),
            sqrt_price_x96: "79228162514264337593543950336".into(),
            log_index: 1,
            ..Default::default()
        };
        let liquidity = upstream::ModifyLiquidityEvent {
            block_number: 100,
            contract: "ab".repeat(20),
            pool_id: "cd".repeat(32),
            transaction_hash: "ef".repeat(32),
            tick_lower: "-887220".into(),
            tick_upper: "887220".into(),
            liquidity_delta: "-340282366920938463463374607431768211455".into(),
            sender: "03".repeat(20),
            salt: "04".repeat(32),
            log_index: 2,
            ..Default::default()
        };
        let out = transform(
            &params(),
            upstream::Events {
                initialize_events: vec![init],
                modify_liquidity_events: vec![liquidity.clone()],
                ..Default::default()
            },
            block(),
        )
        .unwrap();
        assert_eq!(out.initialized[0].log_index, 107);
        assert_eq!(out.liquidity_changes[0].log_index, 108);
        assert_eq!(out.initialized[0].tick, 0);
        assert_eq!(out.initialized[0].tick_spacing, 60);
        assert_eq!(
            out.liquidity_changes[0].liquidity_delta,
            liquidity.liquidity_delta
        );
        let mut invalid = liquidity;
        invalid.tick_upper = invalid.tick_lower.clone();
        assert!(transform(
            &params(),
            upstream::Events {
                modify_liquidity_events: vec![invalid],
                ..Default::default()
            },
            block()
        )
        .is_err());
    }
    #[test]
    fn same_local_index_in_different_transactions_orders_by_block_index() {
        let first = swap();
        let mut second = swap();
        second.transaction_hash = "12".repeat(32);
        second.tick = "240".into();
        let mut input = block();
        // Both receipts use local index 0. Deliberately reverse the source array
        // and transaction array so neither input order can stand in for log order.
        input.transaction_traces = vec![trace(0x12, &[(0, 108)]), trace(0xef, &[(0, 107)])];
        let out = transform(
            &params(),
            upstream::Events {
                swap_events: vec![second, first],
                ..Default::default()
            },
            input,
        )
        .unwrap();
        assert_eq!(
            out.swaps
                .iter()
                .map(|s| (s.log_index, s.tick))
                .collect::<Vec<_>>(),
            vec![(107, -120), (108, 240)]
        );
        assert_eq!(
            out.swaps[0].transaction_hash,
            format!("0x{}", "ef".repeat(32))
        );
    }
    #[test]
    fn rejects_missing_or_mismatched_receipt_mapping() {
        let events = upstream::Events {
            swap_events: vec![swap()],
            ..Default::default()
        };
        let mut missing_transaction = block();
        missing_transaction.transaction_traces.clear();
        assert!(transform(&params(), events.clone(), missing_transaction)
            .unwrap_err()
            .to_string()
            .contains("receipt log missing"));
        let mut missing_receipt = block();
        missing_receipt.transaction_traces[0].receipt = None;
        assert!(transform(&params(), events.clone(), missing_receipt).is_err());
        let mut missing_local = block();
        missing_local.transaction_traces = vec![trace(0xef, &[(1, 107)])];
        assert!(transform(&params(), events.clone(), missing_local).is_err());
        let mut wrong_transaction = block();
        wrong_transaction.transaction_traces[0].hash = vec![0x12; 32];
        assert!(transform(&params(), events.clone(), wrong_transaction).is_err());
        let mut wrong_address = block();
        wrong_address.transaction_traces[0]
            .receipt
            .as_mut()
            .unwrap()
            .logs[0]
            .address = vec![0x12; 20];
        assert!(transform(&params(), events, wrong_address)
            .unwrap_err()
            .to_string()
            .contains("address mismatch"));
    }
    #[test]
    fn rejects_ambiguous_local_or_global_receipt_indices() {
        let events = upstream::Events {
            swap_events: vec![swap()],
            ..Default::default()
        };
        for traces in [
            vec![trace(0xef, &[(0, 107), (0, 108)])],
            vec![trace(0xef, &[(0, 107)]), trace(0x12, &[(0, 107)])],
            vec![trace(0xef, &[(0, 107)]), trace(0xef, &[(1, 108)])],
        ] {
            let mut input = block();
            input.transaction_traces = traces;
            assert!(transform(&params(), events.clone(), input)
                .unwrap_err()
                .to_string()
                .contains("ambiguous receipt"));
        }
    }
}
