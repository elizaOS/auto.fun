/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/staking.json`.
 */
export type Staking = {
  address: "BB9hUaLkTzWhzdVzi8BxjVD1CQuYMpqP3SiwQ5saAQ2W";
  metadata: {
    name: "staking";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "addReward";
      discriminator: [4, 114, 188, 164, 149, 249, 198, 237];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "poolRewardTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ];
              },
              {
                kind: "account";
                path: "pool";
              }
            ];
          };
        },
        {
          name: "userRewardTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "account";
                path: "rewardTokenProgram";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "rewardTokenProgram";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        }
      ];
    },
    {
      name: "claim";
      discriminator: [62, 198, 214, 193, 213, 159, 108, 210];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "poolRewardTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ];
              },
              {
                kind: "account";
                path: "pool";
              }
            ];
          };
        },
        {
          name: "user";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "pool";
              },
              {
                kind: "account";
                path: "signer";
              }
            ];
          };
        },
        {
          name: "userRewardTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "account";
                path: "rewardTokenProgram";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "rewardTokenProgram";
        }
      ];
      args: [];
    },
    {
      name: "deposit";
      discriminator: [242, 35, 198, 137, 82, 225, 242, 182];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "poolTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ];
              },
              {
                kind: "account";
                path: "pool";
              }
            ];
          };
        },
        {
          name: "user";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "pool";
              },
              {
                kind: "account";
                path: "signer";
              }
            ];
          };
        },
        {
          name: "userTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "mint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "userRewardTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "account";
                path: "rewardTokenProgram";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "tokenProgram";
        },
        {
          name: "rewardTokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        }
      ];
    },
    {
      name: "initPool";
      discriminator: [116, 233, 199, 204, 115, 159, 171, 36];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "poolTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ];
              },
              {
                kind: "account";
                path: "pool";
              }
            ];
          };
        },
        {
          name: "stakingTokenProgram";
        },
        {
          name: "rewardTokenProgram";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "duration";
          type: "u64";
        }
      ];
    },
    {
      name: "setRewardsDistributor";
      discriminator: [206, 253, 127, 161, 112, 79, 246, 210];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "newDistributor";
        }
      ];
      args: [];
    },
    {
      name: "setRewardsDuration";
      discriminator: [232, 60, 202, 185, 170, 30, 6, 184];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        }
      ];
      args: [
        {
          name: "duration";
          type: "u64";
        }
      ];
    },
    {
      name: "withdraw";
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34];
      accounts: [
        {
          name: "signer";
          writable: true;
          signer: true;
        },
        {
          name: "mint";
        },
        {
          name: "rewardMint";
        },
        {
          name: "pool";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [112, 111, 111, 108];
              },
              {
                kind: "account";
                path: "mint";
              },
              {
                kind: "account";
                path: "rewardMint";
              }
            ];
          };
        },
        {
          name: "poolTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  115,
                  116,
                  97,
                  107,
                  105,
                  110,
                  103,
                  95,
                  116,
                  111,
                  107,
                  101,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ];
              },
              {
                kind: "account";
                path: "pool";
              }
            ];
          };
        },
        {
          name: "user";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 115, 101, 114];
              },
              {
                kind: "account";
                path: "pool";
              },
              {
                kind: "account";
                path: "signer";
              }
            ];
          };
        },
        {
          name: "userTokenAccount";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "account";
                path: "signer";
              },
              {
                kind: "account";
                path: "tokenProgram";
              },
              {
                kind: "account";
                path: "mint";
              }
            ];
            program: {
              kind: "const";
              value: [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ];
            };
          };
        },
        {
          name: "tokenProgram";
        },
        {
          name: "associatedTokenProgram";
          address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        }
      ];
    }
  ];
  accounts: [
    {
      name: "pool";
      discriminator: [241, 154, 109, 4, 17, 177, 109, 188];
    },
    {
      name: "user";
      discriminator: [159, 117, 95, 227, 239, 151, 58, 236];
    }
  ];
  events: [
    {
      name: "addedRewardEvent";
      discriminator: [81, 152, 209, 151, 169, 177, 56, 230];
    },
    {
      name: "claimEvent";
      discriminator: [93, 15, 70, 170, 48, 140, 212, 219];
    },
    {
      name: "depositEvent";
      discriminator: [120, 248, 61, 83, 31, 142, 107, 144];
    },
    {
      name: "initializedPoolEvent";
      discriminator: [227, 128, 183, 214, 34, 48, 149, 240];
    },
    {
      name: "setDistributorEvent";
      discriminator: [189, 202, 181, 40, 244, 202, 105, 43];
    },
    {
      name: "setDurationEvent";
      discriminator: [201, 237, 103, 244, 56, 212, 178, 234];
    },
    {
      name: "withdrawEvent";
      discriminator: [22, 9, 133, 26, 160, 44, 71, 192];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "notDistributor";
      msg: "Not Distributor";
    },
    {
      code: 6001;
      name: "zeroAmount";
      msg: "Zero Amount Added";
    },
    {
      code: 6002;
      name: "insufficientFunds";
      msg: "Insufficient Funds";
    },
    {
      code: 6003;
      name: "notRewardRegister";
      msg: "Not Reward Register";
    },
    {
      code: 6004;
      name: "rewardAlreadyExists";
      msg: "Reward Already Exists";
    },
    {
      code: 6005;
      name: "alreadyInitialized";
      msg: "Pool Already Initialized";
    },
    {
      code: 6006;
      name: "invalidDistributor";
      msg: "Invalid Rewards Distributor";
    },
    {
      code: 6007;
      name: "overflow";
      msg: "Math Overflow";
    },
    {
      code: 6008;
      name: "userAccountNotProvided";
      msg: "User Account Not Provided";
    },
    {
      code: 6009;
      name: "userRewardNotProvided";
      msg: "User Reward Account Not Provided";
    },
    {
      code: 6010;
      name: "rewardsUnalignedWithUserRewards";
      msg: "User Reward Accounts Have Different Length to Reward Accounts";
    },
    {
      code: 6011;
      name: "poolRewardsUnequalToRewardsPassed";
      msg: "Rewards Passed Do Not Equal the Amount of Rewards in the Pool";
    },
    {
      code: 6012;
      name: "mismatchedReward";
      msg: "Order of Rewards Not Same As Pool";
    },
    {
      code: 6013;
      name: "invalidMint";
      msg: "Mint doesn't Match Reward Mint";
    },
    {
      code: 6014;
      name: "rewardsStillActive";
      msg: "Reward Period Is Still Active";
    },
    {
      code: 6015;
      name: "mismatchedUserPool";
      msg: "Pool Does Not Match User Account";
    },
    {
      code: 6016;
      name: "zeroRewardRate";
      msg: "Zero Reward Rate";
    },
    {
      code: 6017;
      name: "invalidDuration";
      msg: "Invalid Duration";
    }
  ];
  types: [
    {
      name: "addedRewardEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "rewardTokenProgram";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "newPoolRewardAmount";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "claimEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "recipient";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "depositEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "depositor";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "initializedPoolEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "reward";
            type: "pubkey";
          },
          {
            name: "distributor";
            type: "pubkey";
          },
          {
            name: "stakingTokenProgram";
            type: "pubkey";
          },
          {
            name: "rewardTokenProgram";
            type: "pubkey";
          },
          {
            name: "duration";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          },
          {
            name: "mintDecimals";
            type: "u8";
          },
          {
            name: "rewardMintDecimals";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "pool";
      type: {
        kind: "struct";
        fields: [
          {
            name: "id";
            type: "pubkey";
          },
          {
            name: "distributor";
            type: "pubkey";
          },
          {
            name: "duration";
            type: "u64";
          },
          {
            name: "periodFinish";
            type: "u64";
          },
          {
            name: "rewardRate";
            type: "u64";
          },
          {
            name: "lastUpdated";
            type: "u64";
          },
          {
            name: "rewardPerTokenStored";
            type: "u64";
          },
          {
            name: "mint";
            type: "pubkey";
          },
          {
            name: "rewardMint";
            type: "pubkey";
          },
          {
            name: "stakingTokenAccount";
            type: "pubkey";
          },
          {
            name: "rewardTokenAccount";
            type: "pubkey";
          },
          {
            name: "totalSupply";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "bumpTokenAccount";
            type: "u8";
          },
          {
            name: "bumpRewardTokenAccount";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "setDistributorEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "newDistributor";
            type: "pubkey";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "setDurationEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "duration";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "user";
      type: {
        kind: "struct";
        fields: [
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "balance";
            type: "u64";
          },
          {
            name: "pendingPayout";
            type: "u64";
          },
          {
            name: "rewardPerTokenPaid";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "withdrawEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pool";
            type: "pubkey";
          },
          {
            name: "withdrawer";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "timestamp";
            type: "u64";
          }
        ];
      };
    }
  ];
  constants: [
    {
      name: "precision";
      type: "u64";
      value: "1000000000";
    }
  ];
};
