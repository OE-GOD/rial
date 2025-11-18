//
//  MerkleTree.swift
//  rial
//
//  Created by aungmaw on 10/9/25.
//

import Foundation
import CryptoKit

class MerkleTree {
    
    private var rootNode: Node
    
    init(dataBlocks: [Data]) {
        let leafNodes = dataBlocks.map { Node(hash: Data(SHA256.hash(data: $0))) }
        self.rootNode = MerkleTree.buildTree(from: leafNodes)
    }
    
    func getRootHash() -> Data {
        return rootNode.hash
    }
    
    private static func buildTree(from nodes: [Node]) -> Node {
        if nodes.count == 1 {
            return nodes[0]
        }
        
        var nextLevel = [Node]()
        var i = 0
        while i < nodes.count {
            let left = nodes[i]
            let right = (i + 1 < nodes.count) ? nodes[i+1] : left // Duplicate last node if odd number
            
            var combinedHashData = Data()
            combinedHashData.append(left.hash)
            combinedHashData.append(right.hash)
            
            let parentHash = Data(SHA256.hash(data: combinedHashData))
            let parentNode = Node(hash: parentHash, left: left, right: right)
            nextLevel.append(parentNode)
            
            i += 2
        }
        
        return buildTree(from: nextLevel)
    }
    
    private class Node {
        let hash: Data
        let left: Node?
        let right: Node?
        
        init(hash: Data, left: Node? = nil, right: Node? = nil) {
            self.hash = hash
            self.left = left
            self.right = right
        }
    }
}
