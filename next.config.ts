import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const wordpressHostname =
  process.env.WORDPRESS_HOSTNAME || "us1.wpdemo.org";
const wordpressUrl = process.env.WORDPRESS_URL;

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: wordpressHostname,
        port: "",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    // The blog used to live at /posts
    const blogRedirects = [
      { source: "/posts/:path*", destination: "/blog/:path*", permanent: true },
      {
        source: "/:locale(it|es|en)/posts/:path*",
        destination: "/:locale/blog/:path*",
        permanent: true,
      },
    ];
    if (!wordpressUrl) {
      return blogRedirects;
    }
    return [
      ...blogRedirects,
      {
        source: "/admin",
        destination: `${wordpressUrl}/wp-admin`,
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
