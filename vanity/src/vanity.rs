use sha2::{Digest, Sha256};
use serde::{Deserialize, Serialize};
use rand::{rngs::ThreadRng, Rng};
use worker::*;

// Define the structures for the vanity address grinding functionality
#[derive(Deserialize)]
pub struct VanityRequest {
    pub target: String,
    pub case_insensitive: Option<bool>,
    pub position: Option<String>, // "prefix", "suffix", or "anywhere" (default: "suffix")
}

#[derive(Serialize)]
pub struct VanityResponse {
    pub pubkey: String,
    pub private_key: String,
    pub attempts: u64,
    pub time_secs: f64,
}

// Core function to grind for a vanity address
pub async fn grind_vanity(req: VanityRequest) -> Result<VanityResponse> {
    let case_insensitive = req.case_insensitive.unwrap_or(false);
    let position = req.position.unwrap_or_else(|| "suffix".to_string());
    
    // Validate position
    if position != "prefix" && position != "suffix" && position != "anywhere" {
        return Err(Error::RustError(format!("Invalid position value: {}", position)));
    }
    
    // Validate and prepare target
    let target = get_validated_target(&req.target, case_insensitive)?;
    
    console_log!("Starting vanity search for: {} (position: {})", target, position);
    
    let start_time = js_sys::Date::now();
    let mut count = 0_u64;
    let mut rng = rand::thread_rng();
    
    loop {
        // Generate a completely random keypair (32 bytes for private key)
        let private_key = generate_random_bytes(&mut rng);
        
        // Generate public key from private key
        let pubkey = generate_pubkey_from_private(&private_key);
        
        // Convert to Base58
        let pubkey_str = bs58::encode(&pubkey).into_string();
        let private_key_str = bs58::encode(&private_key).into_string();
        
        let check_str = if case_insensitive {
            maybe_bs58_aware_lowercase(&pubkey_str)
        } else {
            pubkey_str.clone()
        };
        
        count += 1;
        
        // Check if this matches our target based on position
        let is_match = match position.as_str() {
            "prefix" => check_str.starts_with(&target),
            "suffix" => check_str.ends_with(&target),
            "anywhere" => check_str.contains(&target),
            _ => false,
        };
        
        if is_match {
            let time_secs = (js_sys::Date::now() - start_time) / 1000.0;
            
            console_log!(
                "Found match: {} after {} attempts in {:.2}s",
                pubkey_str, count, time_secs
            );
            
            return Ok(VanityResponse {
                pubkey: pubkey_str,
                private_key: private_key_str,
                attempts: count,
                time_secs,
            });
        }
        
        // Prevent blocking the worker for too long - yield every 1000 attempts
        if count % 1000 == 0 {
            // Yield to the event loop using a simple Promise delay
            let promise = js_sys::Promise::resolve(&wasm_bindgen::JsValue::NULL);
            let _ = wasm_bindgen_futures::JsFuture::from(promise).await;
        }
    }
}

// Generate random bytes for private key
fn generate_random_bytes(rng: &mut ThreadRng) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    rng.fill(&mut bytes);
    bytes
}

// Generate a public key from a private key
// This is a simplified version - in a real implementation we would use ed25519-dalek or similar
fn generate_pubkey_from_private(private_key: &[u8; 32]) -> [u8; 32] {
    // For Solana, we would normally use ed25519 to derive the public key
    // As a simplified version for this example, we'll just hash the private key
    // In a real implementation, replace this with proper ed25519 key derivation
    let pubkey_bytes: [u8; 32] = Sha256::new()
        .chain_update(private_key)
        .finalize()
        .into();
    
    pubkey_bytes
}

fn get_validated_target(target: &str, case_insensitive: bool) -> Result<String> {
    // Static string of BS58 characters
    const BS58_CHARS: &str = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    // Validate target (i.e. does it include 0, O, I, l)
    for c in target.chars() {
        if !BS58_CHARS.contains(c) {
            return Err(Error::RustError(format!("Invalid character in target: {}", c)));
        }
    }

    // Return bs58-aware lowercase if needed
    Ok(if case_insensitive {
        maybe_bs58_aware_lowercase(target)
    } else {
        target.to_string()
    })
}

fn maybe_bs58_aware_lowercase(target: &str) -> String {
    // L is only char that shouldn't be converted to lowercase in case-insensitivity case
    const LOWERCASE_EXCEPTIONS: &str = "L";

    target
        .chars()
        .map(|c| {
            if LOWERCASE_EXCEPTIONS.contains(c) {
                c
            } else {
                c.to_ascii_lowercase()
            }
        })
        .collect::<String>()
}