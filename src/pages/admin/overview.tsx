import React from "react";

export default function AdminOverview() {
  return (
    <div className="p-4 bg-autofun-background-input rounded-md">
      <h2 className="text-xl font-bold mb-4">Admin Overview</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Users</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">0</p>
          <p className="text-sm text-autofun-text-secondary">Total users</p>
        </div>
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Tokens</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">0</p>
          <p className="text-sm text-autofun-text-secondary">Total tokens</p>
        </div>
        <div className="p-4 bg-autofun-background-primary rounded-md">
          <h3 className="text-lg font-medium mb-2">Volume</h3>
          <p className="text-2xl font-bold text-autofun-text-highlight">0 SOL</p>
          <p className="text-sm text-autofun-text-secondary">24h volume</p>
        </div>
      </div>
    </div>
  );
}
