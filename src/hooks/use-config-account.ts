import { queryClient } from "@/utils/api";
import { Autofun, AutofunProd, SEED_CONFIG } from "@/utils/program";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
// The query key should be consistent
const configAccountQueryKey = ["configAccount"];

export const getConfigAccount = async (
  program: Program<Autofun | AutofunProd>,
) => {
  return queryClient.ensureQueryData({
    queryKey: configAccountQueryKey,
    queryFn: async () => {
      if (!program) {
        throw new Error("missing program");
      }

      const [configPda, _] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED_CONFIG)],
        program.programId,
      );
      const configAccount = await program.account.config.fetch(configPda);

      return configAccount;
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};
