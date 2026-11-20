"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Download,
  Globe,
  Laptop,
  Smartphone,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { MobileHeader } from "@/components/Nav";
import {
  APP_BUILDS,
  APP_LATEST,
  APP_RELEASES,
  APP_WEB_URL,
  releaseAsset,
  type AppBuild,
} from "@/lib/apps";

const ICONS: Record<string, LucideIcon> = {
  android: Smartphone,
  windows: Laptop,
  linux: Terminal,
  macos: Laptop,
};

function BuildCard({ build }: { build: AppBuild }) {
  const Icon = ICONS[build.id] ?? Download;
  return (
    <article className="dl-card">
      <div className="dl-card__head">
        <span className="dl-card__icon">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <span>
          <strong>{build.os}</strong>
          <small>{build.detail}</small>
        </span>
        <span className="badge mono dl-card__format">{build.format}</span>
      </div>
      <p>{build.blurb}</p>
      <a className="btn primary dl-card__cta" href={releaseAsset(build.file)}>
        <Download size={14} /> Download for {build.os}
      </a>
      {build.alternates?.map((alt) => (
        <a key={alt.file} className="dl-card__alt" href={releaseAsset(alt.file)}>
          Also available: {alt.label} <ArrowUpRight size={11} />
        </a>
      ))}
    </article>
  );
}

export default function DownloadPage() {
  return (
    <main className="page dl-page">
      <MobileHeader title="Get the app" />

      <header className="dl-hero">
        <span className="eyebrow">Syncourse everywhere</span>
        <h1 className="display">
          Learn on the screen
          <br />
          you already have.
        </h1>
        <p>
          One codebase, four native builds and the web. Courses, notes, collections and your progress
          stay in sync because every client reads the same API.
        </p>
        <div className="dl-hero__actions">
          <a className="btn primary" href={releaseAsset("syncourse-android.apk")}>
            <Smartphone size={15} /> Android APK
          </a>
          <a className="btn" href={APP_WEB_URL} target="_blank" rel="noreferrer">
            <Globe size={15} /> Open the web app
          </a>
        </div>
        <p className="dl-hero__note mono">
          Version history, checksums and every platform:{" "}
          <a href={APP_RELEASES} target="_blank" rel="noreferrer">
            github.com/Hayredin950/syncourse/releases <ArrowUpRight size={10} />
          </a>
        </p>
      </header>

      <section className="dl-grid" aria-label="Desktop and mobile downloads">
        {APP_BUILDS.map((build) => (
          <BuildCard key={build.id} build={build} />
        ))}
      </section>

      <section className="dl-notes">
        <div className="dark-panel dl-note">
          <h3>
            <Smartphone size={15} /> Android
          </h3>
          <p>
            Download the APK, then allow installs from your browser when Android asks. It is the same
            package published on every release — update by installing the newer file over the old one.
          </p>
        </div>
        <div className="dark-panel dl-note">
          <h3>
            <Laptop size={15} /> Desktop
          </h3>
          <p>
            The desktop builds are unsigned. macOS will warn on first launch (right-click → Open);
            Windows SmartScreen may ask once. Both are expected for a small project without a paid
            signing certificate, and both only need to be accepted the first time.
          </p>
        </div>
        <div className="dark-panel dl-note">
          <h3>
            <Globe size={15} /> Web first
          </h3>
          <p>
            Nothing requires an install. The web app is installable as a PWA from the browser menu, and
            a link always shows the newest release: {" "}
            <a href={APP_LATEST} target="_blank" rel="noreferrer">
              latest build <ArrowUpRight size={10} />
            </a>
            .
          </p>
        </div>
      </section>

      <section className="dl-faq">
        <h2>What you get on every platform</h2>
        <ul>
          {[
            "The same catalogue, search and filters as the website",
            "Offline-first lists and saved courses",
            "Premium checkout inside the app, verified by the same payment API",
            "Sign in once — the session is stored securely on the device",
          ].map((line) => (
            <li key={line}>
              <Check size={13} /> {line}
            </li>
          ))}
        </ul>
        <p className="muted">
          Still unsure? <Link href="/browse">Browse the catalogue in the browser</Link> — no account
          needed.
        </p>
      </section>
    </main>
  );
}
