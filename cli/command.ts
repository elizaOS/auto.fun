// CLI for testing the anchor program
import { program } from "commander";
import { PublicKey } from "@solana/web3.js";
import {
  configProject,
  launchToken,
  withdraw,
  setClusterConfig,
  swap,
} from "./scripts";

program.version("0.0.1");

programCommand("config").action(async (directory, cmd) => {
  const { env, keypair, rpc } = cmd.opts();

  console.log("Solana Cluster:", env);
  console.log("RPC URL:", rpc);

  await setClusterConfig(env, keypair, rpc);

  await configProject();
});

programCommand("launch").action(async (directory, cmd) => {
  const { env, keypair, rpc } = cmd.opts();

  console.log("Solana Cluster:", env);
  console.log("RPC URL:", rpc);

  await setClusterConfig(env, keypair, rpc);

  await launchToken();
});

programCommand("swap")
  .option("-t, --token <string>", "token address")
  .option("-a, --amount <number>", "swap amount")
  .option("-s, --style <string>", "0: buy token, 1: sell token")
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, token, amount, style } = cmd.opts();

    console.log("Solana Cluster:", env);
    console.log("RPC URL:", rpc);

    await setClusterConfig(env, keypair, rpc);

    if (token === undefined) {
      console.log("Error token address");
      return;
    }

    if (amount === undefined) {
      console.log("Error swap amount");
      return;
    }

    if (style === undefined) {
      console.log("Error swap style");
      return;
    }

    await swap(new PublicKey(token), amount, style);
  });

programCommand("withdraw")
  .option("-t, --token <string>", "token address")
  .action(async (directory, cmd) => {
    const { env, keypair, rpc, token } = cmd.opts();

    console.log("Solana Cluster:", env);
    console.log("RPC URL:", rpc);

    await setClusterConfig(env, keypair, rpc);

    if (token === undefined) {
      console.log("Error token address");
      return;
    }

    await withdraw(new PublicKey(token));
  });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      //  mainnet-beta, testnet, devnet
      "-e, --env <string>",
      "Solana cluster env name",
      process.env.NETWORK
    )
    .option(
      "-r, --rpc <string>",
      "Solana cluster RPC name",
      process.env.NETWORK === 'devnet' ? process.env.DEVNET_SOLANA_RPC_URL! : process.env.MAINNET_SOLANA_RPC_URL!
    )
    .option(
      "-k, --private-key <string>",
      "Wallet private key array",
      process.env.WALLET_PRIVATE_KEY
    );
}

program.parse(process.argv);

/*

yarn script config
yarn script launch
yarn script swap -t 26dJZbn9PU5TuGs6QEfoq5TRoFBQzf4vGPCz3wJEXiUk -a 4000000000 -s 0
yarn script withdraw -t 26dJZbn9PU5TuGs6QEfoq5TRoFBQzf4vGPCz3wJEXiUk

*/
