//! Synthetic protobuf input for the actual WASM boundary regression, never a live stream fixture.
use prost::Message;
use substreams_ethereum_core::pb::eth::v2::{
    Block, BlockHeader, Log, TransactionReceipt, TransactionTrace,
};
fn main() {
    let path = std::env::args().nth(1).expect("output path required");
    let block = Block {
        number: 100,
        hash: vec![100; 32],
        header: Some(BlockHeader {
            parent_hash: vec![99; 32],
            timestamp: Some(prost_types::Timestamp {
                seconds: 1234,
                nanos: 0,
            }),
            ..Default::default()
        }),
        // Separate transactions share local index 0, but have distinct global
        // indices. Empty topics keep the upstream decoder-empty fixture valid;
        // WASM wrapper tests supply explicitly synthetic decoded swap messages.
        transaction_traces: [(11, 107), (12, 108)]
            .into_iter()
            .map(|(hash_byte, block_index)| TransactionTrace {
                hash: vec![hash_byte; 32],
                receipt: Some(TransactionReceipt {
                    logs: vec![Log {
                        address: vec![1; 20],
                        index: 0,
                        block_index,
                        ..Default::default()
                    }],
                    ..Default::default()
                }),
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    };
    std::fs::write(path, block.encode_to_vec()).expect("write fixture");
}
