//! Synthetic protobuf input for the actual WASM boundary regression, never a live stream fixture.
use prost::Message;
use substreams_ethereum_core::pb::eth::v2::{Block, BlockHeader};
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
        ..Default::default()
    };
    std::fs::write(path, block.encode_to_vec()).expect("write fixture");
}
