import React from "react";
import { Link } from "react-router-dom";

export default function AdminReports() {
  // Mock data for demonstration
  const reports = [
    { 
      id: 1, 
      type: "Token", 
      subject: "token123", 
      reason: "Inappropriate content", 
      status: "open", 
      reportedBy: "wallet123", 
      createdAt: "2025-04-15" 
    },
    { 
      id: 2, 
      type: "User", 
      subject: "wallet456", 
      reason: "Spam", 
      status: "investigating", 
      reportedBy: "wallet789", 
      createdAt: "2025-04-14" 
    },
    { 
      id: 3, 
      type: "Token", 
      subject: "token456", 
      reason: "Scam", 
      status: "closed", 
      reportedBy: "wallet123", 
      createdAt: "2025-04-10" 
    },
  ];

  return (
    <div className="p-4 bg-autofun-background-input ">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Reports</h2>
        <div className="flex space-x-2">
          <select 
            className="bg-autofun-background-primary text-autofun-text-primary px-3 py-2 "
            defaultValue="all"
          >
            <option value="all">All Reports</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="closed">Closed</option>
          </select>
          <select 
            className="bg-autofun-background-primary text-autofun-text-primary px-3 py-2 "
            defaultValue="all"
          >
            <option value="all">All Types</option>
            <option value="token">Token</option>
            <option value="user">User</option>
          </select>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-autofun-background-primary">
              <th className="text-left p-2">ID</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Subject</th>
              <th className="text-left p-2">Reason</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Reported By</th>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-b border-autofun-background-primary">
                <td className="p-2">{report.id}</td>
                <td className="p-2">{report.type}</td>
                <td className="p-2">
                  {report.type === "Token" ? (
                    <Link 
                      to={`/admin/tokens/${report.subject}`}
                      className="text-autofun-text-highlight hover:underline"
                    >
                      {report.subject}
                    </Link>
                  ) : (
                    <Link 
                      to={`/admin/users/${report.subject}`}
                      className="text-autofun-text-highlight hover:underline"
                    >
                      {report.subject}
                    </Link>
                  )}
                </td>
                <td className="p-2">{report.reason}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    report.status === 'open' 
                      ? 'bg-red-900 text-red-300' 
                      : report.status === 'investigating' 
                        ? 'bg-yellow-900 text-yellow-300' 
                        : 'bg-green-900 text-green-300'
                  }`}>
                    {report.status}
                  </span>
                </td>
                <td className="p-2">
                  <Link 
                    to={`/admin/users/${report.reportedBy}`}
                    className="text-autofun-text-highlight hover:underline"
                  >
                    {report.reportedBy}
                  </Link>
                </td>
                <td className="p-2">{report.createdAt}</td>
                <td className="p-2">
                  <button 
                    className="text-autofun-text-highlight hover:underline"
                    onClick={() => alert(`View report ${report.id}`)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 flex justify-between items-center">
        <div className="text-autofun-text-secondary">
          Showing {reports.length} of {reports.length} reports
        </div>
        <div className="flex space-x-2">
          <button 
            className="px-3 py-1 bg-autofun-background-primary  disabled:opacity-50"
            disabled
          >
            Previous
          </button>
          <button 
            className="px-3 py-1 bg-autofun-background-primary  disabled:opacity-50"
            disabled
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
