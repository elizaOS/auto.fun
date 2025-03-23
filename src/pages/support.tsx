import Footer from "@/components/footer";
import { Link } from "react-router";

export default function SupportPage() {
  return (
    <div className="flex flex-col flex-1 min-h-[100vh]">
      <div className="max-w-[800px] mx-auto mb-8">
        <h1 className="text-4xl font-bold text-white mb-8">Support</h1>

        <div className="space-y-8">
          {/* Contact Section */}
          <section className="bg-[#171717] rounded-lg p-6 border border-[#262626]">
            <h2 className="text-2xl font-medium text-white mb-4">Contact Us</h2>
            <p className="text-[#8C8C8C] mb-4">
              Need help? You can reach us through any of these channels:
            </p>
            <div className="space-y-4">
              <Link
                to="https://twitter.com/autofunai"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white hover:text-[#2FD345] transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                @autofunai
              </Link>
              <Link
                to="https://discord.gg/autofun"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-white hover:text-[#2FD345] transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Join our Discord
              </Link>
              <Link
                to="mailto:support@auto.fun"
                className="flex items-center gap-2 text-white hover:text-[#2FD345] transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                support@auto.fun
              </Link>
            </div>
          </section>

          {/* FAQ Section */}
          <section className="bg-[#171717] rounded-lg p-6 border border-[#262626]">
            <h2 className="text-2xl font-medium text-white mb-4">
              Frequently Asked Questions
            </h2>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-white mb-2">
                  How do I create a token?
                </h3>
                <p className="text-[#8C8C8C]">
                  Click on the Create Token button in the navigation bar and
                  follow the simple steps to launch your token.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">
                  What is the bonding curve?
                </h3>
                <p className="text-[#8C8C8C]">
                  A bonding curve is a mathematical curve that defines the
                  relationship between a tokens price and its supply. The more
                  tokens that are purchased, the higher the price becomes.
                </p>
              </div>
              <div>
                <h3 className="text-lg font-medium text-white mb-2">
                  How does liquidity work?
                </h3>
                <p className="text-[#8C8C8C]">
                  When a token reaches $100k market cap, $17k of liquidity is
                  automatically deposited into Raydium and the LP tokens are
                  burned.
                </p>
              </div>
            </div>
          </section>

          {/* Resources Section */}
          <section className="bg-[#171717] rounded-lg p-6 border border-[#262626]">
            <h2 className="text-2xl font-medium text-white mb-4">Resources</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Link
                to="/terms-of-service"
                className="p-4 bg-[#212121] rounded-md hover:bg-[#262626] transition-colors"
              >
                <h3 className="text-white font-medium mb-2">
                  Terms of Service
                </h3>
                <p className="text-[#8C8C8C] text-sm">
                  Read our terms and conditions
                </p>
              </Link>
              <Link
                to="/privacy-policy"
                className="p-4 bg-[#212121] rounded-md hover:bg-[#262626] transition-colors"
              >
                <h3 className="text-white font-medium mb-2">Privacy Policy</h3>
                <p className="text-[#8C8C8C] text-sm">
                  Learn about our privacy practices
                </p>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
