import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service — BikerOrNot',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-black tracking-tight">
            Biker<span className="text-orange-500">Or</span>Not
          </Link>
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Sign in
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-black text-white mb-2">Terms of Service</h1>
        <p className="text-zinc-500 text-sm mb-6">Effective Date: February 24, 2026</p>

        {/* Preamble */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-10 space-y-3">
          <p className="text-zinc-300 leading-relaxed">
            Welcome to BikerOrNot.com (&ldquo;BikerOrNot,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;). These Terms of Service (&ldquo;Terms&rdquo;) govern
            your access to and use of the BikerOrNot website, mobile applications, and all related services
            (collectively, the &ldquo;Platform&rdquo;). By creating an account or using the Platform, you agree to be
            bound by these Terms. If you do not agree, do not use the Platform.
          </p>
          <p className="text-amber-400 text-sm font-semibold">
            ⚠ Please read these Terms carefully. They include an arbitration clause, a class action waiver,
            and limitations on our liability.
          </p>
        </div>

        <div className="space-y-10 text-zinc-300 leading-relaxed">

          {/* 1. Eligibility */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">1. Eligibility</h2>
            <p className="mb-3">To use BikerOrNot, you must:</p>
            <ul className="list-disc list-outside ml-5 space-y-2 mb-4">
              <li>Be at least 18 years of age.</li>
              <li>Reside in a jurisdiction where the Platform is available.</li>
              <li>Not be prohibited from using the Platform under applicable law.</li>
              <li>Not have a previously terminated BikerOrNot account due to a violation of these Terms.</li>
            </ul>
            <p className="mb-4">
              By using the Platform, you represent and warrant that you meet all eligibility requirements.
              We may, at our sole discretion, refuse service, terminate accounts, or remove content if we
              believe eligibility requirements have not been met.
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-sm">
              <p className="text-white font-semibold mb-1">Children&rsquo;s Privacy (COPPA)</p>
              <p className="text-zinc-400">
                BikerOrNot is intended solely for users 18 years of age and older. We do not knowingly
                collect, solicit, or maintain personal information from anyone under 18. If we learn that
                we have collected personal information from a person under 18, we will delete that
                information and terminate the associated account as quickly as reasonably possible. If you
                believe we may have information from or about a minor, please contact us at{' '}
                <a href="mailto:legal@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  legal@bikerornot.com
                </a>.
              </p>
            </div>
          </section>

          {/* 2. Account Registration */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">2. Account Registration</h2>
            <p className="mb-3">
              To access most features of the Platform, you must create an account. When registering,
              you agree to:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 mb-4">
              <li>
                Provide accurate, current, and complete information, including your first name, last name,
                zip code, and relationship status.
              </li>
              <li>
                Maintain and promptly update your account information to keep it accurate and current.
              </li>
              <li>Keep your password confidential and not share it with any third party.</li>
              <li>
                Notify us immediately at{' '}
                <a href="mailto:support@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  support@bikerornot.com
                </a>{' '}
                if you suspect any unauthorized use of your account.
              </li>
            </ul>
            <p>
              You are solely responsible for all activity that occurs under your account. We reserve the
              right to suspend or terminate accounts that provide inaccurate, false, or misleading
              information.
            </p>
          </section>

          {/* 3. User Content */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">3. User Content</h2>

            <h3 className="text-base font-semibold text-white mb-2">3.1 Content You Post</h3>
            <p className="mb-4">
              The Platform allows you to post, upload, and share content including text, photos, videos,
              and other materials (&ldquo;User Content&rdquo;). You retain ownership of any intellectual property
              rights you hold in your User Content.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">3.2 License to BikerOrNot</h3>
            <p className="mb-4">
              By posting User Content on the Platform, you grant BikerOrNot a non-exclusive, royalty-free,
              worldwide, sublicensable, and transferable license to use, host, store, reproduce, modify,
              create derivative works of, communicate, publish, and distribute such User Content in
              connection with operating and improving the Platform.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">3.3 Content Standards</h3>
            <p className="mb-3">You agree that you will NOT post User Content that:</p>
            <ul className="list-disc list-outside ml-5 space-y-2 mb-4">
              <li>Is false, misleading, or deceptive.</li>
              <li>Is defamatory, obscene, pornographic, vulgar, or offensive.</li>
              <li>Promotes discrimination, bigotry, racism, hatred, or harm against any individual or group.</li>
              <li>Violates or infringes any third party&rsquo;s intellectual property, privacy, or other rights.</li>
              <li>Contains spam, chain letters, pyramid schemes, or commercial solicitation.</li>
              <li>Contains viruses, malware, or any other malicious code.</li>
              <li>Violates any applicable law or regulation.</li>
              <li>Harasses, bullies, intimidates, or threatens other users.</li>
            </ul>

            <h3 className="text-base font-semibold text-white mb-2">3.4 Content Removal</h3>
            <p>
              We reserve the right, but are not obligated, to review, screen, and remove any User Content
              at any time and for any reason, including content that we determine, in our sole discretion,
              violates these Terms or may be harmful to the Platform, its users, or third parties.
            </p>
          </section>

          {/* 4. Community Guidelines */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">4. Community Guidelines</h2>
            <p className="mb-3">
              BikerOrNot is a community built for motorcycle enthusiasts. We expect all members to treat
              one another with respect. You agree to use the Platform in a manner consistent with all
              applicable laws and these Terms. Specifically, you agree not to:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2">
              <li>
                Impersonate any person or entity, or misrepresent your affiliation with any person
                or entity.
              </li>
              <li>Stalk, harass, or harm another user.</li>
              <li>
                Collect or harvest any personally identifiable information from the Platform without
                authorization.
              </li>
              <li>
                Use the Platform for any commercial solicitation, advertising, or spam without our prior
                written consent.
              </li>
              <li>
                Circumvent, disable, or otherwise interfere with security-related features of the Platform.
              </li>
              <li>
                Access or use the Platform in a way that could damage, disable, overburden, or impair
                our servers or networks.
              </li>
              <li>
                Use automated tools (bots, scrapers, crawlers, or similar technologies) to access or
                interact with the Platform without our prior written consent.
              </li>
              <li>
                Use content from the Platform to train, fine-tune, or otherwise develop artificial
                intelligence or machine learning models without our express written permission.
              </li>
            </ul>
          </section>

          {/* 5. Social Features */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">5. Social Features</h2>
            <p className="mb-3">
              The Platform provides social networking features including friend connections, direct
              messaging, commenting, content sharing, groups, and notifications. These features are
              provided to facilitate genuine community interaction among motorcycle enthusiasts. You
              agree to use these features responsibly and in accordance with these Terms.
            </p>
            <p>
              We are not responsible for User Content shared via direct messages or posted by other users.
              If you receive content that you believe violates these Terms, please use our reporting tools
              to notify us. We also provide blocking tools to allow you to restrict unwanted contact from
              other users.
            </p>
          </section>

          {/* 6. Privacy */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">6. Privacy</h2>
            <p className="mb-3">
              Your privacy is important to us. Our{' '}
              <Link href="/privacy" className="text-orange-400 hover:text-orange-300">
                Privacy Policy
              </Link>
              , incorporated herein by reference, explains how we collect, use, and protect your personal
              information. By using the Platform, you consent to the data practices described in our
              Privacy Policy.
            </p>
            <p>
              Your profile information, including your name and general location (zip code area), may be
              visible to other registered users of the Platform. You can adjust your privacy settings from
              your account dashboard.
            </p>
          </section>

          {/* 7. Electronic Communications */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">7. Electronic Communications</h2>
            <p className="mb-3">
              By creating an account on BikerOrNot, you consent to receive electronic communications from
              us, including notifications, account-related messages, and service announcements delivered
              via email, in-app notifications, or other electronic means. These communications may include:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 mb-4">
              <li>
                Account activity notices (e.g., friend requests, direct messages, post interactions,
                group invitations).
              </li>
              <li>
                Operational and security updates (e.g., account activity alerts, policy changes).
              </li>
              <li>
                Legal notices required by applicable law, including copyright infringement notices.
              </li>
            </ul>
            <p>
              You agree that all agreements, notices, disclosures, and other communications we provide
              to you electronically satisfy any legal requirement that such communications be in writing.
              You may adjust notification preferences from your account settings, but certain operational
              and legal communications cannot be opted out of while you maintain an active account.
            </p>
          </section>

          {/* 8. Intellectual Property */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">8. Intellectual Property</h2>
            <p className="mb-3">
              The Platform and its original content (excluding User Content), features, and functionality
              are and will remain the exclusive property of BikerOrNot and its licensors. Our trademarks,
              logos, and service marks may not be used in connection with any product or service without
              our prior written consent.
            </p>
            <p>
              If you believe that your copyrighted work has been infringed on the Platform, please refer
              to Section 9 below and our full{' '}
              <Link href="/dmca" className="text-orange-400 hover:text-orange-300">
                DMCA Copyright Policy
              </Link>
              , or contact us at{' '}
              <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                dmca@bikerornot.com
              </a>.
            </p>
          </section>

          {/* 9. DMCA */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">9. Copyright Infringement and DMCA</h2>
            <p className="mb-4">
              BikerOrNot respects the intellectual property rights of others and complies with the Digital
              Millennium Copyright Act of 1998 (&ldquo;DMCA&rdquo;), 17 U.S.C. § 512. Our complete{' '}
              <Link href="/dmca" className="text-orange-400 hover:text-orange-300">
                DMCA Copyright Policy
              </Link>{' '}
              is incorporated herein by reference.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">9.1 Reporting Infringement</h3>
            <p className="mb-4">
              If you believe content on the Platform infringes your copyright, you may submit a written
              takedown notice via our{' '}
              <Link href="/dmca/report" className="text-orange-400 hover:text-orange-300">
                online form
              </Link>{' '}
              or by emailing our designated DMCA agent at{' '}
              <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                dmca@bikerornot.com
              </a>
              . Valid notices must meet all requirements of 17 U.S.C. § 512(c)(3). Knowingly submitting
              a false infringement notice may expose you to liability under 17 U.S.C. § 512(f).
            </p>

            <h3 className="text-base font-semibold text-white mb-2">9.2 Counter-Notices</h3>
            <p className="mb-4">
              If you believe your content was removed as a result of mistake or misidentification, you
              may submit a counter-notice via our{' '}
              <Link href="/dmca/counter-notice" className="text-orange-400 hover:text-orange-300">
                counter-notice form
              </Link>
              . Upon receipt of a valid counter-notice, we will forward it to the original complainant.
              Removed content may be restored no sooner than 10 and no later than 14 business days after
              receipt, unless the complainant files a court action (17 U.S.C. § 512(g)(3)).
            </p>

            <h3 className="text-base font-semibold text-white mb-2">9.3 Repeat Infringer Policy</h3>
            <p>
              In accordance with the DMCA, BikerOrNot has adopted a repeat infringer policy. Users who
              accumulate multiple valid copyright infringement strikes against their account may have their
              account suspended or permanently terminated at our sole discretion. We may also limit or
              terminate access for users who infringe the intellectual property rights of others, even in
              the absence of repeated violations.
            </p>
          </section>

          {/* 10. Third-Party Links */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">10. Third-Party Links and Services</h2>
            <p>
              The Platform may contain links to third-party websites or services that are not owned or
              controlled by BikerOrNot. We have no control over, and assume no responsibility for, the
              content, privacy policies, or practices of any third-party websites or services. We
              encourage you to review the terms and privacy policies of any third-party sites you visit.
            </p>
          </section>

          {/* 11. Disclaimers */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">11. Disclaimers</h2>
            <p className="mb-3 text-sm uppercase tracking-wide">
              The Platform is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis without warranties of
              any kind, either express or implied, including but not limited to warranties of
              merchantability, fitness for a particular purpose, non-infringement, or course of
              performance.
            </p>
            <p>
              BikerOrNot does not warrant that: (a) the Platform will function uninterrupted, securely,
              or be available at any particular time or location; (b) any errors or defects will be
              corrected; (c) the Platform is free of viruses or other harmful components; or (d) the
              results of using the Platform will meet your requirements.
            </p>
          </section>

          {/* 12. Limitation of Liability */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">12. Limitation of Liability</h2>
            <p className="mb-3 text-sm uppercase tracking-wide">
              To the maximum extent permitted by applicable law, in no event shall BikerOrNot, its
              directors, employees, partners, agents, suppliers, or affiliates, be liable for any
              indirect, incidental, special, consequential, or punitive damages, including without
              limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting
              from:
            </p>
            <ul className="list-disc list-outside ml-5 space-y-2 mb-4 text-sm uppercase">
              <li>Your access to or use of (or inability to access or use) the Platform.</li>
              <li>Any conduct or content of any third party on the Platform.</li>
              <li>Any content obtained from the Platform.</li>
              <li>Unauthorized access, use, or alteration of your transmissions or content.</li>
            </ul>
            <p className="text-sm uppercase tracking-wide">
              In no event shall our aggregate liability to you exceed the greater of one hundred dollars
              ($100) or the amounts paid by you to BikerOrNot in the past twelve (12) months.
            </p>
          </section>

          {/* 13. Indemnification */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">13. Indemnification</h2>
            <p>
              You agree to defend, indemnify, and hold harmless BikerOrNot and its licensees, licensors,
              employees, contractors, agents, officers, and directors from and against any and all claims,
              damages, obligations, losses, liabilities, costs, or debt, and expenses (including
              attorney&rsquo;s fees), resulting from or arising out of: (a) your use of and access to the
              Platform; (b) your violation of any term of these Terms; (c) your violation of any
              third-party right, including without limitation any copyright, property, or privacy right;
              or (d) any claim that your User Content caused damage to a third party.
            </p>
          </section>

          {/* 14. Dispute Resolution */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">14. Dispute Resolution and Arbitration</h2>

            <h3 className="text-base font-semibold text-white mb-2">14.1 Informal Resolution</h3>
            <p className="mb-4">
              Before initiating any formal dispute proceeding, you agree to first contact us at{' '}
              <a href="mailto:legal@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                legal@bikerornot.com
              </a>{' '}
              and attempt to resolve the dispute informally. We will attempt to resolve the dispute
              within 30 days.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">14.2 Binding Arbitration</h3>
            <p className="mb-4">
              If we cannot resolve the dispute informally, you and BikerOrNot agree to resolve any claims
              through final and binding arbitration, except as set forth under the exceptions below. The
              arbitration shall be conducted by a neutral arbitrator in accordance with the American
              Arbitration Association (AAA) rules.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">14.3 Class Action Waiver</h3>
            <p className="mb-4 text-sm uppercase tracking-wide">
              You and BikerOrNot agree that each may bring claims against the other only in your or its
              individual capacity and not as a plaintiff or class member in any purported class or
              representative proceeding.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">14.4 Exceptions</h3>
            <p>
              Notwithstanding the above, either party may bring an individual action in small claims
              court, and either party may seek emergency injunctive relief from a court of competent
              jurisdiction to prevent irreparable harm.
            </p>
          </section>

          {/* 15. Governing Law */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">15. Governing Law</h2>
            <p>
              These Terms shall be governed and construed in accordance with the laws of the State of
              Delaware, without regard to its conflict of law provisions. To the extent arbitration does
              not apply, you agree to submit to the exclusive personal jurisdiction of the courts located
              in Delaware for the resolution of any dispute.
            </p>
          </section>

          {/* 16. Suspension and Termination */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">16. Account Suspension and Termination</h2>

            <h3 className="text-base font-semibold text-white mb-2">16.1 Suspension</h3>
            <p className="mb-4">
              We may temporarily suspend your account at any time, without prior notice, if we have
              reason to believe you have violated these Terms, your account has been compromised, or
              suspension is necessary to protect the Platform or other users. We will notify you of a
              suspension and the reason for it via the email address on file where reasonably practicable.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">16.2 Termination by Us</h3>
            <p className="mb-4">
              We may terminate your account permanently, without prior notice or liability, for any
              reason, including repeated or serious violations of these Terms, accumulation of copyright
              infringement strikes under our repeat infringer policy, conduct harmful to the community,
              or failure to meet eligibility requirements. Upon termination, your right to use the
              Platform will immediately cease.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">16.3 Termination by You</h3>
            <p className="mb-4">
              You may delete your account at any time through your account settings. Upon account
              deletion, your profile will be removed from public view, though we may retain certain data
              as required by applicable law or as described in our Privacy Policy.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">16.4 Effect of Termination</h3>
            <p>
              All provisions of these Terms which by their nature should survive termination shall
              survive, including without limitation ownership provisions, warranty disclaimers,
              indemnity, and limitations of liability.
            </p>
          </section>

          {/* 17. Modifications */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">17. Modifications to Terms</h2>
            <p className="mb-3">
              We reserve the right to modify or replace these Terms at any time at our sole discretion.
              We will provide notice of significant changes by posting the updated Terms on the Platform
              and updating the &ldquo;Effective Date&rdquo; above. Your continued use of the Platform after any
              changes constitutes your acceptance of the new Terms.
            </p>
            <p>
              We encourage you to review these Terms periodically. If you do not agree to any modified
              Terms, you must stop using the Platform.
            </p>
          </section>

          {/* 18. General Provisions */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">18. General Provisions</h2>

            <h3 className="text-base font-semibold text-white mb-2">18.1 Entire Agreement</h3>
            <p className="mb-4">
              These Terms, together with our Privacy Policy, constitute the entire agreement between you
              and BikerOrNot regarding the Platform and supersede all prior and contemporaneous
              agreements.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">18.2 Severability</h3>
            <p className="mb-4">
              If any provision of these Terms is found to be unenforceable or invalid, that provision
              will be limited or eliminated to the minimum extent necessary so that these Terms will
              otherwise remain in full force and effect.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">18.3 No Waiver</h3>
            <p className="mb-4">
              Our failure to enforce any right or provision of these Terms will not be considered a
              waiver of those rights.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">18.4 Assignment</h3>
            <p className="mb-4">
              You may not assign or transfer these Terms, by operation of law or otherwise, without our
              prior written consent. We may freely assign these Terms.
            </p>

            <h3 className="text-base font-semibold text-white mb-2">18.5 Force Majeure</h3>
            <p>
              BikerOrNot shall not be liable for any failure or delay in performance resulting from
              causes beyond our reasonable control, including acts of God, war, terrorism, pandemic,
              government action, or internet service provider failures.
            </p>
          </section>

          {/* 19. Contact */}
          <section>
            <h2 className="text-xl font-bold text-white mb-3">19. Contact Information</h2>
            <p className="mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 text-sm space-y-1.5">
              <p className="text-white font-semibold">BikerOrNot.com</p>
              <p>
                Legal:{' '}
                <a href="mailto:legal@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  legal@bikerornot.com
                </a>
              </p>
              <p>
                Support:{' '}
                <a href="mailto:support@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  support@bikerornot.com
                </a>
              </p>
              <p>
                Copyright:{' '}
                <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  dmca@bikerornot.com
                </a>
              </p>
              <p>
                Website:{' '}
                <a href="https://www.bikerornot.com" className="text-orange-400 hover:text-orange-300">
                  www.bikerornot.com
                </a>
              </p>
            </div>
          </section>

        </div>
      </div>

      <footer className="border-t border-zinc-800 py-8 px-6 mt-16">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-zinc-600">
          <p>&copy; {new Date().getFullYear()} BikerOrNot.com. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors">Privacy Policy</Link>
            <Link href="/dmca" className="hover:text-zinc-400 transition-colors">DMCA Policy</Link>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
