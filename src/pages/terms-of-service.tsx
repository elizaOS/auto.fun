import { useState } from "react";
import Footer from "../components/footer";

const TermsOfService = () => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (sectionId: string | null) => {
    if (activeSection === sectionId) {
      setActiveSection(null);
    } else {
      setActiveSection(sectionId);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-[100vh]">
      <div className="max-w-4xl mx-auto p-6 text-white">
        <h1 className="text-3xl font-bold mb-4">Terms of Service</h1>
        <p className="text-sm mb-6">Last Updated: March 25, 2025</p>

        <div className="mb-8">
          <p className="mb-4">
            These Terms of Service are a legally binding agreement between you
            and Eliza Labs, Inc. ("Eliza Labs", "we", "our" or "us"). These
            Terms govern your use of auto.fun services available on or through
            our platform. auto.fun services may be provided by Eliza Labs or any
            affiliate of Eliza Labs.
          </p>
          <p className="mb-4">
            By using the auto.fun platform and/or services, you confirm that
            you've read, understood and accepted these Terms, along with any
            additional documents. You agree to follow these Terms, including any
            updates or changes we make.
          </p>
          <p className="mb-4">
            If you don't understand or accept these Terms completely, you should
            not use the auto.fun platform.
          </p>
        </div>

        <div className="bg-autofun-background-action-disabled border border-red-500 p-4 rounded-md mb-8">
          <h2 className="text-xl font-bold text-red-700 mb-2">RISK WARNING</h2>
          <p className="mb-4">
            Digital Asset values can change dramatically, and you could lose
            money when buying, selling, holding or investing in Digital Assets.
            Consider whether trading or holding Digital Assets is right for you
            based on your personal and financial situation.
          </p>
          <p className="mb-4">
            Make sure you fully understand the risks before using the auto.fun
            platform and services.
          </p>
          <p className="mb-4">
            You acknowledge that we are not your broker, agent or advisor and
            have no special obligation to you regarding any activities on the
            auto.fun platform. We don't provide investment or consulting advice,
            and nothing we communicate should be considered advice.
          </p>
          <p className="mb-4">
            You're responsible for deciding if any investment or transaction is
            appropriate for you based on your goals, financial situation and
            risk tolerance. You're also responsible for any losses. We don't
            recommend buying, selling or holding any Digital Asset. Before
            making any decision about Digital Assets, do your own research and
            talk to a financial advisor. We're not responsible for your
            decisions or any losses from those decisions.
          </p>
        </div>

        {/* Section 1 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section1")}
          >
            <span>1. Introduction</span>
            <span>{activeSection === "section1" ? "−" : "+"}</span>
          </button>
          {activeSection === "section1" && (
            <div className="py-2">
              <p className="mb-2">
                1.1. auto.fun is a platform that helps with creating and trading
                Digital Assets. Eliza Labs provides users with a platform to
                create Digital Assets.
              </p>
              <p className="mb-2">
                1.2. Using the auto.fun platform means you're entering into a
                legally binding agreement with us. These Terms will govern how
                you use the auto.fun platform.
              </p>
              <p className="mb-2">
                1.3. You need to read these Terms and any referenced documents
                carefully. Let us know if anything isn't clear.
              </p>
              <p className="mb-2">
                1.4. You agree to follow any additional terms that apply to your
                use of the auto.fun platform.
              </p>
            </div>
          )}
        </div>

        {/* Section 2 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section2")}
          >
            <span>2. Eligibility</span>
            <span>{activeSection === "section2" ? "−" : "+"}</span>
          </button>
          {activeSection === "section2" && (
            <div className="py-2">
              <p className="mb-2">
                2.1. To use the auto.fun platform, you must:
              </p>
              <p className="mb-2 pl-4">
                a. be an individual, company, or organization with the full
                power and authority to use the auto.fun platform and follow
                these Terms;
              </p>
              <p className="mb-2 pl-4">
                b. if you're acting for a company or organization, you must be
                authorized to act on their behalf;
              </p>
              <p className="mb-2 pl-4">
                c. not be located, incorporated, established in, resident of, or
                have business operations in:
              </p>
              <p className="mb-2 pl-8">
                i. any place where it would be illegal for you to use auto.fun,
                or where it would cause us to break any law; or
              </p>
              <p className="mb-2 pl-8">
                ii. a country on our List of Prohibited Countries.
              </p>
              <p className="mb-2">
                2.2. We can change our eligibility requirements anytime. When
                possible, we'll notify you in advance. However, sometimes we may
                need to make changes without notice when:
              </p>
              <p className="mb-2 pl-4">
                a. we're making the change because of legal or regulatory
                requirements;
              </p>
              <p className="mb-2 pl-4">b. the changes benefit you; and/or</p>
              <p className="mb-2 pl-4">
                c. there's a valid reason that doesn't allow time for notice.
              </p>
              <p className="mb-2">
                If we can't give you advance notice, we'll let you know about
                the change as soon as possible.
              </p>
            </div>
          )}
        </div>

        {/* Section 3 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section3")}
          >
            <span>3. auto.fun Platform</span>
            <span>{activeSection === "section3" ? "−" : "+"}</span>
          </button>
          {activeSection === "section3" && (
            <div className="py-2">
              <p className="mb-2">
                3.1. We provide access to the auto.fun platform at our
                discretion. We can refuse access or restrict your use of the
                platform anytime without giving a reason.
              </p>
              <p className="mb-2">
                3.2. You must not post or upload abusive, defamatory, dishonest,
                or obscene content to the auto.fun platform. You also can't post
                content meant to manipulate markets or spread false information,
                or content that breaks any laws. Doing so may result in your
                access being limited or terminated.
              </p>
              <p className="mb-2">
                3.3. You must not post abusive, defamatory, dishonest, or
                obscene content on any platform about Digital Assets created on
                auto.fun. You also can't post content meant to manipulate
                markets or spread false information, or content that breaks any
                laws. Doing so may result in your access being limited or
                terminated.
              </p>
            </div>
          )}
        </div>

        {/* Section 4 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section4")}
          >
            <span>4. Fees and Calculations</span>
            <span>{activeSection === "section4" ? "−" : "+"}</span>
          </button>
          {activeSection === "section4" && (
            <div className="py-2">
              <p className="mb-2">
                4.1. Fees for using the auto.fun platform can be found here.
              </p>
              <p className="mb-2">
                4.2. You agree to pay all fees related to your use of the
                auto.fun platform as requested during your use.
              </p>
              <p className="mb-2">
                4.3. You authorize us to deduct all fees, commissions, interest,
                charges and other amounts you owe from the Wallet you connect to
                the auto.fun platform.
              </p>
              <p className="mb-2">
                4.4. We may change our fees from time to time according to
                Section 14.4 of these Terms.
              </p>
              <p className="mb-2">
                4.5. Any calculations made by auto.fun regarding your use of the
                platform are final unless there's an obvious error.
              </p>
            </div>
          )}
        </div>

        {/* Section 5 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section5")}
          >
            <span>5. Records</span>
            <span>{activeSection === "section5" ? "−" : "+"}</span>
          </button>
          {activeSection === "section5" && (
            <div className="py-2">
              <p className="mb-2">
                We keep your personal data to enable your continued use of the
                auto.fun platform, and as required by law for tax purposes,
                accounting, and compliance with anti-money laundering laws.
              </p>
            </div>
          )}
        </div>

        {/* Additional sections would continue the same pattern */}

        {/* Jump to important sections */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section29")}
          >
            <span>29. Contact</span>
            <span>{activeSection === "section29" ? "−" : "+"}</span>
          </button>
          {activeSection === "section29" && (
            <div className="py-2">
              <p className="mb-2">
                29.1. If you have questions, feedback or complaints, contact our
                Support team through https://t.me/autofunsupport
              </p>
              <p className="mb-2">
                29.2. We'll contact you using the details you provide or that we
                can reasonably find, such as by messaging you directly on X
                (formerly known as Twitter).
              </p>
            </div>
          )}
        </div>

        {/* Section 31 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section31")}
          >
            <span>31. Wallets</span>
            <span>{activeSection === "section31" ? "−" : "+"}</span>
          </button>
          {activeSection === "section31" && (
            <div className="py-2">
              <p className="mb-2">
                31.1. The Wallet that may be provided through the auto.fun
                mobile app is provided by Privy.io and remains the
                responsibility of Privy.io and you.
              </p>
              <p className="mb-2">
                31.2. Neither Eliza Labs nor its affiliates are responsible for
                how the Wallet works or for any losses or damage resulting
                directly or indirectly from using the Wallet.
              </p>
            </div>
          )}
        </div>

        {/* Section 32 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center cursor-pointer"
            onClick={() => toggleSection("section32")}
          >
            <span>32. Definitions and interpretation</span>
            <span>{activeSection === "section32" ? "−" : "+"}</span>
          </button>
          {activeSection === "section32" && (
            <div className="py-2">
              <p className="mb-2">In these Terms:</p>
              <p className="mb-2">
                32.1. Section headings and numbering are only for convenience
                and don't affect the meaning or interpretation of any section or
                subsection of these Terms;
              </p>
              <p className="mb-2">
                32.2. The words "include" or "including" mean including without
                limitation;
              </p>

              {/* Definitions section */}
              <div className="mt-4">
                <p className="mb-2 font-semibold">
                  32.7. Unless the context requires otherwise, these terms have
                  the following meanings:
                </p>

                <div className="pl-4">
                  <p className="mb-2">
                    <span className="font-medium">"Activity History"</span>{" "}
                    means the record of your transactions and activity on the
                    auto.fun platform.
                  </p>

                  <p className="mb-2">
                    <span className="font-medium">"Applicable Law"</span> means
                    all relevant laws, regulations, rules, requirements,
                    notices, orders, judgments, directives, codes of conduct,
                    guidelines, and interpretations that apply to the provision,
                    receipt or use of the auto.fun platform or any products or
                    services provided in connection with the auto.fun platform.
                  </p>

                  <p className="mb-2">
                    <span className="font-medium">"Website"</span> means the
                    website located at www.auto.fun.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TermsOfService;
