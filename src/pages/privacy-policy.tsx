import { useState } from "react";
import Footer from "../components/footer";

const PrivacyPolicy = () => {
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (sectionId: string | null) => {
    if (activeSection === sectionId) {
      setActiveSection(null);
    } else {
      setActiveSection(sectionId);
    }
  };

  return (
    <div className="flex flex-col flex-1 h-[100vh]">
      <div className="max-w-4xl mx-auto p-6 text-white">
        <h1 className="text-3xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-sm mb-6">Last Updated: January 16, 2025</p>

        <div className="mb-8">
          <p className="mb-4">
            This Privacy Policy describes the privacy practices of Eliza Labs,
            Inc. and its affiliates (collectively, "Eliza Labs", "our", "us" or
            "we"), in connection with the auto.fun platform and services. This
            Privacy Policy also explains your rights and choices regarding your
            information.
          </p>
          <p className="mb-4">
            Please read this Privacy Policy carefully. If you don't agree with
            our policies, please don't use the auto.fun platform. By using the
            auto.fun platform, you acknowledge and agree to the terms of this
            Privacy Policy.
          </p>
          <p className="mb-4">
            We may update this Privacy Policy as laws, regulations, and industry
            standards evolve, or as we make changes to the auto.fun platform. If
            we make significant changes affecting your privacy rights, we'll
            inform you appropriately. If you disagree with the changes, you
            should stop using the auto.fun platform.
          </p>
          <p className="mb-4">
            The auto.fun platform is not intended for anyone under 18 years old.
            We don't knowingly collect personal data from minors. If a parent or
            guardian discovers their child has provided us with information,
            they should contact us, and we'll delete such information as soon as
            reasonably possible.
          </p>
        </div>

        {/* Section 1 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section1")}
          >
            <span>1. Personal Data Controller</span>
            <span>{activeSection === "section1" ? "−" : "+"}</span>
          </button>
          {activeSection === "section1" && (
            <div className="py-2">
              <p className="mb-4">
                "Personal Data" as used in this policy means information that
                can identify a specific person. Personal Data doesn't include
                information that has been combined or anonymized so that a
                specific person can no longer be identified. Any reference to
                "Personal Data" in this Privacy Policy includes "Personal Data"
                as defined by the Data Protection Act 2018.
              </p>
              <p className="mb-4">
                A Personal Data controller is a person or organization who
                controls the collection, storage, processing or use of Personal
                Data, including anyone who directs another person or
                organization to collect, store, process, use, transfer or
                disclose Personal Data on their behalf.
              </p>
            </div>
          )}
        </div>

        {/* Section 2 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section2")}
          >
            <span>2. Types of Personal Data Collected</span>
            <span>{activeSection === "section2" ? "−" : "+"}</span>
          </button>
          {activeSection === "section2" && (
            <div className="py-2">
              <p className="mb-4">
                The types of Personal Data we may collect from you or through
                third parties depends on our interactions with you and may
                include:
              </p>
              <ul className="list-disc pl-8 mb-4">
                <li className="mb-2">
                  Financial information such as your wallet addresses;
                </li>
                <li className="mb-2">
                  Transaction information such as wallet addresses of senders
                  and recipients of Digital Assets, activities on the auto.fun
                  platform, your inquiries and our responses;
                </li>
                <li className="mb-2">
                  Usage Data including your IP address, country of origin,
                  browser or operating system information, how you use the
                  auto.fun platform, and other identifiers;
                </li>
                <li className="mb-2">
                  Other personal or commercial information that we may need to
                  comply with anti-money laundering laws and regulations.
                </li>
              </ul>
              <p className="mb-4">
                We may also collect Personal Data about you from third parties
                and public sources of information.
              </p>
              <p className="mb-4">
                We collect this information when you provide it on the auto.fun
                platform or when you use our services. We may also collect your
                Personal Data from third parties or public sources as mentioned
                above.
              </p>
              <p className="mb-4">
                Unless specified otherwise, all Personal Data we request is
                required, and failure to provide this information may prevent
                you from accessing or using the auto.fun platform. When the
                auto.fun platform specifically states that some Personal Data is
                optional, you can choose not to provide it without affecting
                your access to the platform. If you're unsure which Personal
                Data is required, please contact us.
              </p>
            </div>
          )}
        </div>

        {/* Section 3 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section3")}
          >
            <span>3. Information We Automatically Collect</span>
            <span>{activeSection === "section3" ? "−" : "+"}</span>
          </button>
          {activeSection === "section3" && (
            <div className="py-2">
              <p className="mb-4">
                When you visit the auto.fun platform, we may automatically
                collect certain information about your device, including web
                browser information, IP address, device information, login
                details, browser type and version, timezone settings, browser
                plugins, operating systems, location information, and cookies
                installed on your device. As you browse the site, we may also
                collect information about the pages you view, referring websites
                or search terms, and how you interact with the site.
              </p>
            </div>
          )}
        </div>

        {/* Section 4 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section4")}
          >
            <span>4. Cookies & Similar Technologies</span>
            <span>{activeSection === "section4" ? "−" : "+"}</span>
          </button>
          {activeSection === "section4" && (
            <div className="py-2">
              <p className="mb-4">
                We use cookies (small text files stored on your device) and
                similar technologies to provide certain functions and help
                collect data. This section explains how we use these
                technologies and how you can control them.
              </p>

              <h4 className="font-semibold text-lg mb-2">How We Use Cookies</h4>
              <p className="mb-4">
                We use cookies to track how you use the auto.fun platform by
                providing usage statistics. Cookies also help deliver
                information and allow account authentication based on your
                browsing history and previous site visits.
              </p>
              <p className="mb-4">
                For clarity, we don't combine or link cookie data with
                third-party data for targeted advertising, advertising
                measurement, or sharing data about specific users or devices
                with data brokers.
              </p>

              <h4 className="font-semibold text-lg mb-2">Types of Cookies</h4>
              <p className="mb-4">
                We use both session cookies (which expire when you close your
                browser) and persistent cookies (which remain on your device
                until deleted). To help you understand why we need them, the
                cookies we use fall into these categories:
              </p>
              <ul className="list-disc pl-8 mb-4">
                <li className="mb-2">
                  <strong>Strictly Necessary</strong>: Required for the site to
                  work properly, including essential authentication cookies.
                </li>
                <li className="mb-2">
                  <strong>Functionality</strong>: Enable technical performance
                  and remember your choices, including sign-in and
                  authentication information.
                </li>
                <li className="mb-2">
                  <strong>Performance/Analytical</strong>: Help us understand
                  how you navigate the site so we can improve it.
                </li>
                <li className="mb-2">
                  <strong>Targeting</strong>: Used to deliver relevant
                  information to devices that have previously visited our site.
                </li>
              </ul>

              <h4 className="font-semibold text-lg mb-2">
                How to Control and Delete Cookies
              </h4>
              <p className="mb-4">
                You can control cookies through your web browser settings.
                Information on how to do this can be found in your browser's
                Help section. Note that cookies are browser-specific, so you'll
                need to manage settings for each browser you use.
              </p>
              <p className="mb-4">
                For mobile devices, check your device's instruction manual or
                settings to control cookies. For more information about cookies
                and how to disable them, visit{" "}
                <a
                  href="https://www.allaboutcookies.org"
                  className="text-blue-600 hover:underline"
                >
                  https://www.allaboutcookies.org
                </a>
                .
              </p>
              <p className="mb-4">
                Please note that if you block cookies, the site may not work
                properly, and you might not have full access to our services.
                We're not responsible for any issues that arise from your cookie
                settings.
              </p>

              <h4 className="font-semibold text-lg mb-2">Google Analytics</h4>
              <p className="mb-4">
                We may use Google Analytics to analyze how you use our site.
                Google Analytics uses cookies to generate statistical
                information about website usage. This information helps create
                reports about site use. Google stores this information.
              </p>
              <p className="mb-4">
                If you don't want Google Analytics to track your site visits,
                you can install the Google Analytics opt-out browser add-on. For
                details on installing and removing the add-on, visit the Google
                Analytics opt-out page.
              </p>
            </div>
          )}
        </div>

        {/* Section 5 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section5")}
          >
            <span>5. Method and Basis of Processing Data</span>
            <span>{activeSection === "section5" ? "−" : "+"}</span>
          </button>
          {activeSection === "section5" && (
            <div className="py-2">
              <h4 className="font-semibold text-lg mb-2">
                Methods of processing
              </h4>
              <p className="mb-4">
                We take appropriate security measures to prevent unauthorized
                access, disclosure, modification, or destruction of your data.
              </p>
              <p className="mb-4">
                We process Personal Data using computers and IT tools, following
                specific procedures related to our stated purposes. Your data
                may be accessible to you and certain authorized personnel
                involved with the operation of the auto.fun platform (including
                administration, legal, and system administrators) or external
                parties (such as technical service providers, hosting providers,
                IT companies) appointed as Data Processors when necessary. You
                can request a list of these parties at any time.
              </p>

              <h4 className="font-semibold text-lg mb-2">
                Legal basis of processing
              </h4>
              <p className="mb-4">
                We may process your Personal Data if one of these conditions
                applies:
              </p>
              <ul className="list-disc pl-8 mb-4">
                <li className="mb-2">
                  You've given consent for specific purposes. Note: In some
                  cases, laws may allow us to process data until you object
                  ("opt-out"), without needing explicit consent.
                </li>
                <li className="mb-2">
                  Providing Personal Data is necessary for performing our
                  agreement with you or for pre-contractual steps.
                </li>
                <li className="mb-2">
                  Processing is required to comply with our legal obligations.
                </li>
                <li className="mb-2">
                  Processing relates to tasks in the public interest or in
                  exercise of official authority.
                </li>
                <li className="mb-2">
                  Processing is necessary for legitimate interests pursued by us
                  or by third parties.
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Section 6 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section6")}
          >
            <span>6. How We Use Personal Data</span>
            <span>{activeSection === "section6" ? "−" : "+"}</span>
          </button>
          {activeSection === "section6" && (
            <div className="py-2">
              <p className="mb-4">Data we collect about you is used to:</p>
              <ul className="list-disc pl-8 mb-4">
                <li className="mb-2">
                  Provide the site and auto.fun platform services you request;
                </li>
                <li className="mb-2">
                  Process transactions and send notices about your platform
                  activities;
                </li>
                <li className="mb-2">
                  Detect malicious or fraudulent activity;
                </li>
                <li className="mb-2">
                  Monitor and analyze your behavior for analytics purposes;
                </li>
                <li className="mb-2">Test new features;</li>
                <li className="mb-2">Contact you;</li>
                <li className="mb-2">
                  Display content from external platforms;
                </li>
                <li className="mb-2">
                  Handle productivity-related activities;
                </li>
                <li className="mb-2">Provide social features;</li>
                <li className="mb-2">
                  Optimize platform traffic and performance;
                </li>
                <li className="mb-2">
                  Register and authenticate you as a user;
                </li>
                <li className="mb-2">
                  Comply with legal obligations and respond to enforcement
                  requests;
                </li>
                <li className="mb-2">
                  Protect the rights and interests of Eliza Labs and affiliates
                  (or those of users and third parties);
                </li>
                <li className="mb-2">Monitor infrastructure;</li>
                <li className="mb-2">
                  Interact with external social networks and platforms;
                </li>
                <li className="mb-2">Enable location-based interactions;</li>
                <li className="mb-2">
                  Manage tags (code pieces that help analyze platform
                  activities);
                </li>
                <li className="mb-2">Optimize and distribute traffic.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Section 7 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section7")}
          >
            <span>7. How We Share Personal Data</span>
            <span>{activeSection === "section7" ? "−" : "+"}</span>
          </button>
          {activeSection === "section7" && (
            <div className="py-2">
              <p className="mb-4">
                We may share your Personal Data with service providers and
                vendors to help provide the auto.fun platform. We don't share
                your Personal Data with third parties without your consent,
                except as described in this Privacy Policy or as required by
                law. We may share your Personal Data within our company group
                and with affiliates for purposes consistent with this Privacy
                Policy.
              </p>
              <p className="mb-4">
                We may share your Personal Data with third-party companies and
                individuals that provide services on our behalf or help operate
                our site or business. These third parties may use your Personal
                Data only as we direct or authorize and in a manner consistent
                with this Privacy Policy. They cannot use your information for
                any other purpose. We may also share your Personal Data for
                compliance purposes.
              </p>
              <p className="mb-4">
                We may sell, transfer or share some or all of our business or
                assets, including your Personal Data, during a business
                transaction (or potential transaction) such as a corporate
                divestiture, merger, consolidation, acquisition, reorganization
                or sale of assets, or in the event of bankruptcy or dissolution.
              </p>
            </div>
          )}
        </div>

        {/* Section 8 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section8")}
          >
            <span>8. Retention of Personal Data</span>
            <span>{activeSection === "section8" ? "−" : "+"}</span>
          </button>
          {activeSection === "section8" && (
            <div className="py-2">
              <p className="mb-4">
                We keep your Personal Data for as long as needed to fulfill the
                purposes we collected it for, including legal, regulatory,
                accounting, or reporting requirements. We determine how long to
                keep data based on amount, nature, sensitivity, potential harm
                risk from unauthorized use, our processing purposes and whether
                we can achieve those purposes through other means, and legal
                requirements.
              </p>
              <p className="mb-4">
                Personal Data collected for contract performance will be kept
                until the contract is fully performed. Personal Data collected
                for our legitimate interests will be kept as long as needed for
                those purposes.
              </p>
              <p className="mb-4">
                We may keep Personal Data longer when you've consented to such
                processing (as long as you don't withdraw consent). We may also
                need to keep Personal Data longer to meet legal obligations or
                official orders.
              </p>
              <p className="mb-4">
                Once the retention period ends, Personal Data will be deleted
                (or, where legally permitted, de-identified). Therefore, your
                rights to access, erase, correct, and transfer data (where
                applicable) cannot be enforced after the retention period ends.
              </p>
              <p className="mb-4">
                However, not all your Personal Data may be deletable or
                de-identifiable; see the "Blockchain transactions" section
                below.
              </p>
            </div>
          )}
        </div>

        {/* Section 9 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section9")}
          >
            <span>9. Privacy Technology Practices</span>
            <span>{activeSection === "section9" ? "−" : "+"}</span>
          </button>
          {activeSection === "section9" && (
            <div className="py-2">
              <h4 className="font-semibold text-lg mb-2">
                Links to Third-Party Sites
              </h4>
              <p className="mb-4">
                The auto.fun platform may contain links to other websites,
                mobile apps, and online services operated by third parties.
                These links are not endorsements or claims of affiliation. Our
                content may also appear on web pages or in apps not associated
                with us. We don't control third-party websites, apps or
                services, and are not responsible for their actions. Other sites
                follow different rules for collecting, using and sharing your
                Personal Data. We encourage you to read the privacy policies of
                other sites you use.
              </p>

              <h4 className="font-semibold text-lg mb-2">Data Security</h4>
              <p className="mb-4">
                Your Personal Data security is important to us. We use
                administrative, technical, and physical safeguards to protect
                the Personal Data we collect. Your information's safety also
                depends on you. Please don't share your personal security
                information.
              </p>
              <p className="mb-4">
                Unfortunately, internet transmission isn't completely secure.
                Although we do our best to protect your Personal Data, we can't
                guarantee the security of data transmitted to the auto.fun
                platform. Any transmission is at your own risk.
              </p>
            </div>
          )}
        </div>

        {/* Section 10 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section10")}
          >
            <span>10. Blockchain Transactions</span>
            <span>{activeSection === "section10" ? "−" : "+"}</span>
          </button>
          {activeSection === "section10" && (
            <div className="py-2">
              <p className="mb-4">
                Your digital asset usage may be recorded on a public blockchain,
                particularly when settling trades. Public blockchains are
                distributed ledgers designed to permanently record transactions
                across wide computer networks. Many blockchains can be analyzed
                to potentially re-identify individuals and reveal personal data,
                especially when blockchain data is combined with other
                information.
              </p>
            </div>
          )}
        </div>

        {/* Section 11 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section11")}
          >
            <span>11. Overseas Disclosure and Your Privacy Rights</span>
            <span>{activeSection === "section11" ? "−" : "+"}</span>
          </button>
          {activeSection === "section11" && (
            <div className="py-2">
              <p className="mb-4">
                For relevant data protection laws, Eliza Labs, Inc. is the
                Personal Data controller. Eliza Labs, Inc. operates worldwide,
                so Personal Data may be transferred outside your country of
                residence for the identified purposes. Any such transfers will
                comply with applicable laws and be protected through
                international data transfer agreements where needed. By using
                the auto.fun platform, you understand that your Personal Data
                may be processed in the United States and outside the EEA and
                UK.
              </p>
              <p className="mb-4">
                EEA and UK residents have certain rights over their Personal
                Data, including:
              </p>
              <ul className="list-disc pl-8 mb-4">
                <li className="mb-2">
                  The right to confirm what Personal Data we process.
                </li>
                <li className="mb-2">
                  The right to correct inaccurate Personal Data.
                </li>
                <li className="mb-2">
                  The right to request data erasure, subject to legal
                  exceptions.
                </li>
                <li className="mb-2">
                  The right to restrict certain processing, if not necessary for
                  contract performance or services.
                </li>
                <li className="mb-2">
                  The right to receive Personal Data in a structured, common,
                  machine-readable format.
                </li>
                <li className="mb-2">
                  The right to object to processing, including automated
                  decision-making and profiling.
                </li>
                <li className="mb-2">
                  The right to withdraw previous consent for Personal Data
                  processing.
                </li>
              </ul>
              <p className="mb-4">
                You can generally access Personal Data we hold about you. In
                normal circumstances, we'll provide full access to your Personal
                Data. We may charge a reasonable fee for providing this access.
                There may be legal or administrative reasons to deny access. If
                we refuse your request, we'll provide reasons where legally
                required.
              </p>
              <p className="mb-4">
                <strong>Complaints</strong>: If you believe we haven't respected
                your privacy or followed this Privacy Policy, please contact
                Support as soon as possible. We'll investigate privacy
                complaints within a reasonable timeframe based on complexity and
                notify you of the outcome.
              </p>
            </div>
          )}
        </div>

        {/* Section 12 */}
        <div className="mb-4 border-b pb-2">
          <button
            className="w-full text-left font-semibold flex justify-between items-center"
            onClick={() => toggleSection("section12")}
          >
            <span>12. General</span>
            <span>{activeSection === "section12" ? "−" : "+"}</span>
          </button>
          {activeSection === "section12" && (
            <div className="py-2">
              <p className="mb-4">
                To exercise any rights listed above or ask questions about your
                Personal Data, please contact Support. Provide enough
                information to identify yourself and describe what right you
                want to exercise and which information your request concerns.
                Any Personal Data we collect to verify your identity will be
                used solely for verification purposes.
              </p>
              <p className="mb-4">
                If you're concerned that we haven't complied with your legal
                rights or applicable privacy laws, you may contact us or your
                local data protection authority.
              </p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
