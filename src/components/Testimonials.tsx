import { ExternalLink, Instagram } from 'lucide-react';

import { SectionHeading } from '@/src/components/ui';

const INSTAGRAM_URL =
  'https://www.instagram.com/carssrivenkateshwara?igsh=MW9tcXBlbzB5M3ZhNw==';

export default function Testimonials() {
  return (
    <section id="reviews" className="overflow-hidden bg-white py-12 md:py-24">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <SectionHeading
          eyebrow="Stay connected"
          title="See What We Share"
          subtitle="Visit the official Sri Venkateshwara Cars Instagram profile for the latest posts from the business."
          align="center"
        />

        <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl bg-surface-container-low p-6 text-center shadow-sm md:p-10">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-tertiary-container/10 text-tertiary-container">
            <Instagram aria-hidden="true" className="size-6" />
          </div>
          <p className="max-w-lg text-sm leading-relaxed text-slate-600 md:text-base">
            We only publish customer feedback when it can be verified. Until then, our Instagram is the honest place to follow current updates.
          </p>
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-tertiary-container px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-tertiary-container/90 active:scale-95"
          >
            Open Instagram <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
