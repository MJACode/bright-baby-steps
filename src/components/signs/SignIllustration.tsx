import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { Sign } from "@/data/signLibrary";
import { SIGN_MEDIA } from "@/data/signMedia";

export function SignIllustration({ sign, className }: { sign: Sign; className?: string }) {
  const media = SIGN_MEDIA[sign.slug];
  // The detail sheet reuses this component when the sign changes. A boolean
  // would keep the previous clip's failure and hide the next sign's video.
  const [failedSlug, setFailedSlug] = useState<string | null>(null);
  const videoFailed = failedSlug === sign.slug;
  const alt = media?.illustrationAlt ?? `How to sign ${sign.label.toUpperCase()}: ${sign.howTo}`;

  let content: ReactNode;
  if (media?.video && !videoFailed) {
    content = (
      <video
        key={sign.slug}
        src={media.video}
        poster={media.videoPoster}
        muted
        loop
        playsInline
        controls
        autoPlay={false}
        preload="metadata"
        aria-label={alt}
        onError={() => setFailedSlug(sign.slug)}
        className="h-full w-full object-contain"
      />
    );
  } else if (media?.illustration) {
    content = (
      <div
        role="img"
        aria-label={alt}
        className="sign-illustration h-full w-full"
        // Bundled asset from src/assets/signs, never user or network content.
        // signMedia.test.ts validates the tree innerHTML builds from each file
        // against an allowlist of SVG shapes, attributes, and sign-* classes.
        dangerouslySetInnerHTML={{ __html: media.illustration }}
      />
    );
  } else {
    content = (
      <span role="img" aria-label={alt} className="text-7xl leading-none">
        {sign.emoji}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-milestones-bg",
        className,
      )}
    >
      {content}
    </div>
  );
}
