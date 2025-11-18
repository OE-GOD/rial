//
//  C2PAClaim.swift
//  rial
//
//  Created by aungmaw on 10/9/25.
//

import Foundation

struct C2PAClaim: Codable {
    let imageRoot: String
    let publicKey: String
    let signature: String
    let timestamp: String
}
