import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { CREATE_CPMM_POOL_PROGRAM, Raydium } from "@raydium-io/raydium-sdk-v2";
import * as raydium_api from "@raydium-io/raydium-sdk-v2";
import {
  getVaultConfig,
  getUserPosition,
  getNftTokenFaucet,
  getLockedLiquidity,
  LOCKING_PROGRAM,
  LOCK_CP_AUTH_SEED,
} from "./pdas";
import { RaydiumVault } from "./types/raydium_vault";

export async function depositToRaydiumVault(
  provider: anchor.AnchorProvider,
  signerWallet: anchor.web3.Keypair,
  program: Program<RaydiumVault>,
  position_nft: anchor.web3.PublicKey,
  claimer_address: anchor.web3.PublicKey
) {
  try {
    anchor.setProvider(provider);

    const vault_config = getVaultConfig(program.programId);
    const user_position = getUserPosition(program.programId, position_nft);
    const from_account = spl.getAssociatedTokenAddressSync(
      position_nft,
      signerWallet.publicKey
    );
    const nft_token_faucet = getNftTokenFaucet(program.programId, position_nft);
    const accounts = {
      authority: signerWallet.publicKey,
      vaultConfig: vault_config,
      userPosition: user_position,
      positionNft: position_nft,
      fromAccount: from_account,
      nftTokenFaucet: nft_token_faucet,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    };

    const call = program.methods.deposit(claimer_address).accounts(accounts);

    const txSignature = await call.rpc();
    console.log("Transaction Signature", txSignature);
    await program.provider.connection.getParsedTransaction(txSignature, {
      commitment: "confirmed",
    });
    return txSignature;
  } catch (error) {
    console.error("Error in depositRaydiumVault:", error);
    throw error;
  }
}

export async function changeClaimer(
  program: Program<RaydiumVault>,
  signerWallet: anchor.web3.Keypair,
  position_nft: anchor.web3.PublicKey,
  new_claimer_address: anchor.web3.PublicKey
) {
  const vault_config = getVaultConfig(program.programId);
  const user_position = getUserPosition(program.programId, position_nft);
  const accounts = {
    authority: signerWallet.publicKey,
    vaultConfig: vault_config,
    userPosition: user_position,
    positionNft: position_nft,
  };
  const call = program.methods
    .changeClaimer(new_claimer_address)
    .accounts(accounts);

  const txSignature = await call.rpc();
  console.log("Transaction Signature", txSignature);
  await program.provider.connection.getParsedTransaction(txSignature, {
    commitment: "confirmed",
  });
  return txSignature;
}

export async function emergencyWithdraw(
  program: Program<RaydiumVault>,
  signerWallet: anchor.web3.Keypair,
  position_nft: anchor.web3.PublicKey
) {
  const vault_config = getVaultConfig(program.programId);
  const user_position = getUserPosition(program.programId, position_nft);
  const to_account = spl.getAssociatedTokenAddressSync(
    position_nft,
    signerWallet.publicKey
  );
  const nft_token_faucet = getNftTokenFaucet(program.programId, position_nft);
  const accounts = {
    authority: signerWallet.publicKey,
    vaultConfig: vault_config,
    userPosition: user_position,
    positionNft: position_nft,
    toAccount: to_account,
    nftTokenFaucet: nft_token_faucet,
    tokenProgram: spl.TOKEN_PROGRAM_ID,
  };
  const call = program.methods.emergencyWithdraw().accounts(accounts);

  const txSignature = await call.rpc();
  console.log("Transaction Signature", txSignature);
  await program.provider.connection.getParsedTransaction(txSignature, {
    commitment: "confirmed",
  });
  return txSignature;
}

export async function claim(
  program: Program<RaydiumVault>,
  signerWallet: anchor.web3.Keypair,
  position_nft: anchor.web3.PublicKey,
  poolId: anchor.web3.PublicKey,
  connection: anchor.web3.Connection
) {
  const vault_config = getVaultConfig(program.programId);
  const [locked_authority] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from(LOCK_CP_AUTH_SEED)],
    LOCKING_PROGRAM
  );
  const CPSWAP_AUTH_SEED = Buffer.from(
    anchor.utils.bytes.utf8.encode("vault_and_lp_mint_auth_seed")
  );
  const user_position = getUserPosition(program.programId, position_nft);
  const nft_token_faucet = getNftTokenFaucet(program.programId, position_nft);
  const fee_nft_owner = vault_config;
  const fee_nft_account = nft_token_faucet;
  const cpmm_program = CREATE_CPMM_POOL_PROGRAM;
  const locked_liquidity = getLockedLiquidity(position_nft); // using default LOCKING_PROGRAM
  const [cp_authority] = anchor.web3.PublicKey.findProgramAddressSync(
    [CPSWAP_AUTH_SEED],
    cpmm_program
  );

  const raydium = await Raydium.load({
    owner: signerWallet,
    connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: "finalized",
  });
  const poolInfo = (
    await raydium.api.fetchPoolById({ ids: poolId.toString() })
  )[0];
  const poolInfoJson = JSON.parse(JSON.stringify(poolInfo));
  const pool_state = new anchor.web3.PublicKey(poolId.toString());
  const lp_mint = new anchor.web3.PublicKey(poolInfoJson.lpMint.address);
  const vault0_mint = new anchor.web3.PublicKey(
    poolInfo.mintA.address.toString()
  );
  const vault1_mint = new anchor.web3.PublicKey(
    poolInfo.mintB.address.toString()
  );
  const cpmm_pool_key = await raydium.cpmm.getCpmmPoolKeys(poolId.toString());
  const token0_vault = new anchor.web3.PublicKey(
    cpmm_pool_key.vault.A.toString()
  );
  const token1_vault = new anchor.web3.PublicKey(
    cpmm_pool_key.vault.B.toString()
  );

  // Ensure associated token accounts exist
  await spl.getOrCreateAssociatedTokenAccount(
    connection,
    signerWallet,
    vault0_mint,
    signerWallet.publicKey
  );
  await spl.getOrCreateAssociatedTokenAccount(
    connection,
    signerWallet,
    vault1_mint,
    signerWallet.publicKey
  );

  const recv_token0_account = spl.getAssociatedTokenAddressSync(
    vault0_mint,
    signerWallet.publicKey,
    true,
    spl.TOKEN_PROGRAM_ID
  );
  const recv_token1_account = spl.getAssociatedTokenAddressSync(
    vault1_mint,
    signerWallet.publicKey,
    true,
    spl.TOKEN_PROGRAM_ID
  );
  const locked_lp_vault = spl.getAssociatedTokenAddressSync(
    lp_mint,
    locked_authority,
    true,
    spl.TOKEN_PROGRAM_ID
  );
  const accounts = {
    authority: signerWallet.publicKey,
    vaultConfig: vault_config,
    userPosition: user_position,
    positionNft: position_nft,
    nftTokenFaucet: nft_token_faucet,
    tokenProgram: spl.TOKEN_PROGRAM_ID,
    systemProgram: anchor.web3.SystemProgram.programId,
    lockedAuthority: locked_authority,
    feeNftOwner: fee_nft_owner,
    feeNftAccount: fee_nft_account,
    lockedLiquidity: locked_liquidity,
    cpmmProgram: cpmm_program,
    cpAuthority: cp_authority,
    poolState: pool_state,
    lpMint: lp_mint,
    recipientToken0Account: recv_token0_account,
    recipientToken1Account: recv_token1_account,
    token0Vault: token0_vault,
    token1Vault: token1_vault,
    vault0Mint: vault0_mint,
    vault1Mint: vault1_mint,
    lockedLpVault: locked_lp_vault,
  };
  const call = program.methods.claim().accounts(accounts);

  const txSignature = await call.rpc();
  console.log("Transaction Signature", txSignature);
  await program.provider.connection.getParsedTransaction(txSignature, {
    commitment: "confirmed",
  });
  return txSignature;
}

export async function checkBalance(
  connection: anchor.web3.Connection,
  signerWallet: anchor.web3.Keypair,
  position_nft: anchor.web3.PublicKey,
  claimer_address: anchor.web3.PublicKey
) {
  await spl.getOrCreateAssociatedTokenAccount(
    connection,
    signerWallet,
    position_nft,
    signerWallet.publicKey
  );
  await spl.getOrCreateAssociatedTokenAccount(
    connection,
    signerWallet,
    position_nft,
    claimer_address
  );
  const position_nft_account_signer = spl.getAssociatedTokenAddressSync(
    position_nft,
    signerWallet.publicKey
  );
  const position_nft_account_claimer = spl.getAssociatedTokenAddressSync(
    position_nft,
    claimer_address
  );

  console.log(
    "signer balance: ",
    (await connection.getTokenAccountBalance(position_nft_account_signer)).value
      .amount
  );
  console.log(
    "claimer balance: ",
    (await connection.getTokenAccountBalance(position_nft_account_claimer))
      .value.amount
  );
}
