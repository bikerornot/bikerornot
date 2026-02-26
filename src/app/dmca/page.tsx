import Link from 'next/link'

export const metadata = {
  title: 'DMCA Copyright Policy — BikerOrNot',
}

export default function DmcaPage() {
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
        <h1 className="text-3xl font-black text-white mb-2">DMCA Copyright Policy</h1>
        <p className="text-zinc-500 text-sm mb-10">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

        <div className="space-y-10 text-zinc-300 leading-relaxed">

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Overview</h2>
            <p>
              BikerOrNot ("the Platform," "we," "us") respects the intellectual property rights of others
              and expects its users to do the same. In accordance with the Digital Millennium Copyright Act
              of 1998 ("DMCA"), 17 U.S.C. § 512, we will respond expeditiously to claims of copyright
              infringement that are reported to our designated copyright agent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Filing a Copyright Infringement Notice</h2>
            <p className="mb-4">
              If you believe that content appearing on BikerOrNot infringes your copyright, you may submit
              a written takedown notice. To be valid under the DMCA, your notice must include
              <strong className="text-white"> all</strong> of the following elements
              (17 U.S.C. § 512(c)(3)):
            </p>
            <ol className="list-decimal list-outside ml-5 space-y-3">
              <li>
                A <strong className="text-white">physical or electronic signature</strong> of the copyright
                owner or a person authorized to act on their behalf.
              </li>
              <li>
                <strong className="text-white">Identification of the copyrighted work</strong> claimed to
                have been infringed. If multiple works are covered by a single notification, a representative
                list of such works.
              </li>
              <li>
                <strong className="text-white">Identification of the infringing material</strong> and
                information reasonably sufficient to permit us to locate it — including the URL(s) on
                BikerOrNot where the content appears.
              </li>
              <li>
                Your <strong className="text-white">contact information</strong>: name, mailing address,
                telephone number, and email address.
              </li>
              <li>
                A statement that you have a <strong className="text-white">good faith belief</strong> that
                the use of the material in the manner complained of is not authorized by the copyright
                owner, its agent, or the law.
              </li>
              <li>
                A statement that the information in the notification is accurate, and
                <strong className="text-white"> under penalty of perjury</strong>, that you are the
                copyright owner or authorized to act on behalf of the owner.
              </li>
            </ol>

            <div className="mt-6 bg-orange-500/10 border border-orange-500/30 rounded-xl p-5">
              <p className="text-orange-300 font-semibold mb-2">Submit your notice</p>
              <p className="text-sm text-zinc-300 mb-3">
                You may file a copyright infringement notice using our online form or by emailing our
                designated DMCA agent directly.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dmca/report"
                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  File a Notice Online
                </Link>
                <a
                  href="mailto:dmca@bikerornot.com"
                  className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
                >
                  dmca@bikerornot.com
                </a>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Counter-Notice Procedure</h2>
            <p className="mb-4">
              If you believe content was removed from BikerOrNot as a result of mistake or
              misidentification, you may submit a written counter-notice. A valid counter-notice must
              include (17 U.S.C. § 512(g)(3)):
            </p>
            <ol className="list-decimal list-outside ml-5 space-y-3">
              <li>Your physical or electronic signature.</li>
              <li>
                Identification of the material that was removed and the location where it appeared
                before removal.
              </li>
              <li>
                A statement under penalty of perjury that you have a good faith belief the material was
                removed as a result of mistake or misidentification.
              </li>
              <li>
                Your name, address, and telephone number, and a statement that you consent to the
                jurisdiction of the Federal District Court for the judicial district in which your address
                is located (or any judicial district if outside the U.S.), and that you will accept
                service of process from the person who filed the original notice.
              </li>
            </ol>
            <p className="mt-4">
              Submit your counter-notice using our{' '}
              <Link href="/dmca/counter-notice" className="text-orange-400 hover:text-orange-300">
                online counter-notice form
              </Link>
              {' '}or email it to{' '}
              <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">
                dmca@bikerornot.com
              </a>
            </p>
            <p className="mt-3 text-sm text-zinc-400">
              Upon receipt of a valid counter-notice, we will forward a copy to the original complainant
              and may restore the removed material no sooner than 10 and no later than 14 business days
              after receipt, unless our designated agent receives notice that the complainant has filed
              a court action.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Repeat Infringer Policy</h2>
            <p>
              In accordance with the DMCA and other applicable law, BikerOrNot has adopted a policy of
              terminating, in appropriate circumstances, the accounts of users who are determined to be
              repeat infringers. We may also, at our sole discretion, limit access or terminate the
              accounts of any users who infringe any intellectual property rights of others, whether or
              not there is any repeat infringement.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Designated DMCA Agent</h2>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-5 text-sm space-y-1">
              <p className="text-white font-semibold">DMCA Designated Agent — BikerOrNot</p>
              <p>Email: <a href="mailto:dmca@bikerornot.com" className="text-orange-400 hover:text-orange-300">dmca@bikerornot.com</a></p>
              <p className="text-zinc-500 text-xs mt-3">
                BikerOrNot has registered a designated agent with the U.S. Copyright Office as required
                by 17 U.S.C. § 512(c)(2).
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-bold text-white mb-3">Disclaimer</h2>
            <p className="text-sm text-zinc-400">
              The information on this page is provided for general informational purposes only and does
              not constitute legal advice. If you are unsure whether material infringes your copyright,
              consult a qualified attorney before submitting a notice. Knowingly submitting a false
              infringement notice may expose you to liability under 17 U.S.C. § 512(f).
            </p>
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
