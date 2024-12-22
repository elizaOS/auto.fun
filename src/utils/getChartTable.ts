"use client";

import { ChartTable } from "@/utils/types";
import { CONTRACT_API_URL } from "@/utils/env";

export async function getChartTable({
  pairIndex,
  from,
  to,
  range,
  token,
}: {
  pairIndex: number;
  from: number;
  to: number;
  range: number;
  token: string;
}): Promise<ChartTable | undefined> {
  try {
    // console.log("GET bars", token, from, to, range, pairIndex)
    const res = await fetch(
      `${CONTRACT_API_URL}/chart/${pairIndex}/${from}/${to}/${range}/${token}`,
    ).then((data) => data.json());

    if (!res) {
      throw new Error();
    }
    // console.log("tradingchart === getch data", res)
    return res as ChartTable;
  } catch (err) {
    console.log("tradingchart === getch data error", err);
    return undefined;
    // return Promise.reject(new Error("Failed at fetching charts"));
  }
}
