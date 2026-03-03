import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import Script from 'next/script'
import Heartbeat from '@/app/components/Heartbeat'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'BikerOrNot — The Motorcycle Enthusiast Network',
  description: 'Connect with fellow riders, share your rides, and find your community.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics — raw script tags so they fire before hydration */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-YJLPP8ZQ6W" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-YJLPP8ZQ6W');
            `,
          }}
        />

        {/* Facebook Pixel — raw script tag so it fires before hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '2703070426753057');
              fbq('track', 'PageView');
            `,
          }}
        />
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=2703070426753057&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
      </head>
      <body className={`${geist.className} antialiased bg-zinc-950 text-white`}>
        <Heartbeat />
        {children}

        {/* Referral source capture — runs on every page so UTM params are
            caught on any landing page, not just /signup */}
        <Script
          id="referral-capture"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  if (localStorage.getItem('signup_ref_url')) return;
                  var p = new URLSearchParams(window.location.search);
                  var src = p.get('utm_source');
                  var med = p.get('utm_medium');
                  var cmp = p.get('utm_campaign');
                  var ref = p.get('ref');
                  var val = null;
                  if (src) {
                    val = src + (med ? ' / ' + med : '') + (cmp ? ' / ' + cmp : '');
                  } else if (ref) {
                    val = 'ref:' + ref;
                  } else if (document.referrer) {
                    val = document.referrer;
                  }
                  if (val) localStorage.setItem('signup_ref_url', val);
                } catch(e) {}
              })();
            `,
          }}
        />

        {/* Google AdSense */}
        <Script
          id="google-adsense"
          strategy="afterInteractive"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3393838345892792"
          crossOrigin="anonymous"
        />
      </body>
    </html>
  )
}
