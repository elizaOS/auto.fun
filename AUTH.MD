# Secure Wallet Authentication System

## Overview

This document describes the secure wallet authentication system implemented for auto.fun. The system uses JWT tokens for authentication with Cloudflare KV for secure token storage, providing a robust and flexible approach to wallet-based authentication.

## Key Features

- **JWT-Based Authentication**: Industry-standard JSON Web Tokens for secure authentication
- **Secure Token Storage**: Token data is stored in Cloudflare KV namespaces for server-side validation
- **Client-Side Persistence**: Tokens stored in localStorage with structured data format
- **Cryptographic Security**: JWT tokens are cryptographically signed to prevent tampering
- **Token Expiration**: Tokens automatically expire after 24 hours
- **Privilege Management**: Support for wallet-specific privileges that can be managed server-side
- **Smooth Migration**: Automatic migration from previous authentication systems
- **Development Mode Support**: Simplified authentication process for local development

## Implementation Components

### Server-Side (Worker)

1. **KV Namespace Configuration**
   - Added KV namespaces in `wrangler.toml` for both production and development environments
   - Added JWT_SECRET for signing JWT tokens
   - Added salt configuration for enhanced security

2. **Authentication Utilities (`auth-utils.ts`)**
   - **JWT Token Management**:
     - `createJwtToken()`: Creates and signs JWT tokens using wallet address as subject
     - `validateJwtToken()`: Validates JWT tokens, checks expiration, and extracts claims
   - **KV Storage Functions**:
     - `hashWithSalt()`: Secure SHA-256 hashing with environment-specific salt
     - `generateTokenKey()`: Produces a hashed key for storing token data
     - `revokeToken()`: Allows revoking specific tokens when needed

3. **Authentication Endpoints (`auth.ts`)**
   - Implements JWT token creation and validation
   - Supports both SIP-99 (Sign-in with Solana) and direct signature verification
   - Handles token revocation during logout
   - Provides auth-status endpoint for checking authentication state

### Client-Side

1. **Authentication Hook (`use-authentication.ts`)**
   - Added support for JWT token validation
   - Implemented `fetchWithAuth` helper to ensure Authorization headers are properly set
   - Enhanced token storage with structured format in localStorage:
     ```typescript
     {
       token: string;        // The JWT token
       walletAddress: string; // The wallet's public key
       timestamp: number;    // Token creation time
     }
     ```
   - Improved error handling and reconnection logic
   - Added JWT token decoding for extracting wallet address
   - Robust token validation and retry mechanisms

2. **Wallet Dialog (`wallet-dialog.tsx`)**
   - Updated to handle JWT tokens from the server
   - Implemented structured localStorage persistence with verification
   - Enhanced error messaging and detailed logging

3. **API Client (`api.ts`)**
   - Updated to use the `fetchWithAuth` helper for all API requests
   - Ensures all requests include the Authorization header with JWT token
   - Handles authentication errors appropriately

## Development Mode

### Setup for Local Development

1. **Environment Variables**
   - Create a `.dev.vars` file with the following variables:
     ```
     NODE_ENV=development
     AUTH_TOKEN_SALT=autofun-wallet-auth-salt-dev-env
     ```
   - This ensures consistent values for development environments

2. **Testing Authentication**
   - In test mode, a special token "valid-token" can be used to authenticate as a test user
   - This simplifies testing without requiring actual wallet signatures

3. **Developer Tools**
   - Use browser developer console to monitor authentication flows
   - Console logs provide detailed information about token processing and API calls
   - When developing locally, CORS is configured to allow connections from localhost

## Authentication Flow

1. **Sign In**
   - User connects their wallet using either adapter or direct Phantom connection
   - User signs a message using SIP-99 format or nonce-based approach
   - Server validates signature and creates a JWT token
   - Token is returned to client and stored in localStorage with metadata

2. **Validation**
   - All API requests include the token in the Authorization header with Bearer prefix
   - Server validates JWT signature, expiration, and subject claim
   - Successful validation returns user data and privileges

3. **Sign Out**
   - Client calls logout endpoint with authenticated request
   - Server records token revocation if needed
   - Client clears all token data from localStorage
   - Wallet disconnection is attempted through both adapter and direct methods

## JWT Token Format

1. **Structure**
   - Standard three-part JWT format: header.payload.signature
   - Header: `{ "alg": "HS256", "typ": "JWT" }`
   - Payload includes:
     - `sub`: Wallet public key
     - `iat`: Issued at timestamp
     - `exp`: Expiration timestamp (24 hours after issuance)
     - `privileges`: Optional array of user privileges

2. **Client Storage**
   - Structured object in localStorage:
     ```typescript
     {
       token: string;        // The JWT token
       walletAddress: string; // The wallet's public key
       timestamp: number;    // Token creation time
     }
     ```
   - Used for both authentication and wallet address persistence

## Security Benefits

1. **Industry Standard**: JWT tokens follow established security practices
2. **Signature Verification**: Tokens can only be validated with server-side JWT secret
3. **No Plaintext Storage**: Secure server-side storage of validation data
4. **Privilege Management**: Admins can assign privileges to specific wallets
5. **Expiration Control**: JWT tokens have built-in expiration handling
6. **Authorization Header**: Modern approach using Bearer token authentication in API requests
7. **Persistence**: Authentication persists even if browser is restarted

## Future Enhancements

- Role-based access control for wallet addresses
- Implement token rotation and refresh token mechanisms
- Add geo-restrictions or additional security factors
- Develop an admin interface for managing wallet privileges
- Add support for wallet-specific rate limiting and permissions 