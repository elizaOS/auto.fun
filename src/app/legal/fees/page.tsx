"use client";

import React, { PropsWithChildren } from "react";

const Td = ({ children }: PropsWithChildren) => (
  <td className="py-2 px-4 border-b border-neutral-800 text-xs tracking-widest last:text-[#2fd345]">
    {children}
  </td>
);

const Th = ({ children }: PropsWithChildren) => (
  <th className="py-2 px-4 text-[#8c8c8c] tracking-widest border-b border-neutral-800">
    {children}
  </th>
);

const FeeTable = () => {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-left">
          <Th>ACTIONS</Th>
          <Th>FEE</Th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <Td>CREATE A TOKEN</Td>
          <Td>0 SOL</Td>
        </tr>

        <tr>
          <Td>TRADING WHILE ON BONDING CURVE</Td>
          <Td>1% OF TOTAL SALE PRICE</Td>
        </tr>
        <tr>
          <Td>RAYDIUM GRADUATION</Td>
          <Td>1% OF MIGRATED LIQUIDITY</Td>
        </tr>
      </tbody>
    </table>
  );
};

const FeeHeader = () => {
  return (
    <div className="flex flex-col p-5 gap-3.5 border-b border-[#262626]">
      <h1 className="text-2xl md:text-[32px] font-satoshi font-medium leading-9 tracking-[-0.018em] text-[#2FD345]">
        Fees On Auto.fun
      </h1>
      <p className="text-sm md:text-base font-satoshi text-[#8C8C8C] leading-6">
        The following fees apply when using the auto.fun platform
      </p>
    </div>
  );
};

const BulletPoint = ({ children }: PropsWithChildren) => {
  return (
    <div className="flex items-center gap-2">
      <div className="w-1.5 h-1.5 rounded-full bg-[#2FD345]" />
      <span className="text-sm md:text-base text-[#8C8C8C]">{children}</span>
    </div>
  );
};

const FeeFooter = () => {
  return (
    <div className="flex flex-col p-5 gap-3.5">
      <p className="text-sm md:text-base font-satoshi text-[#2FD345]">
        Trading fees are distributed as follows
      </p>

      <BulletPoint>Buy fees (1%) are collected in SOL</BulletPoint>
      <BulletPoint>All fees are sent to token creators</BulletPoint>
    </div>
  );
};

const FeesContent = () => {
  return (
    <div className="w-full m-auto flex items-center justify-center p-4">
      <div className="w-full max-w-[600px] bg-[#171717] border border-[#262626] rounded-md">
        <FeeHeader />
        <FeeTable />
        <FeeFooter />
      </div>
    </div>
  );
};

export default FeesContent;
