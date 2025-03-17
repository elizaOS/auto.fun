import { Outlet } from "react-router";

export default function Layout() {
  return (
    <body>
      <div className="min-h-screen bg-secondary flex flex-col">
        <header className="bg-secondary text-white p-4">
          <h1 className="text-2xl font-bold">My Tailwind Project</h1>
        </header>
        <main className="flex-grow container">
          <Outlet />
        </main>
        <footer className="bg-gray-800 text-white p-4 text-center">
          © 2025 My Tailwind Project
        </footer>
      </div>
    </body>
  );
}
