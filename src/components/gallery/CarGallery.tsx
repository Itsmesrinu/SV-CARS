import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import CarImage, { prefetchCarImage } from '@/src/components/CarImage';
import type { CarImageDTO } from '@/src/types/api';

/** Width the main gallery requests, so neighbour prefetches hit the same cache entry. */
const GALLERY_WIDTH = 1200;

interface CarGalleryProps {
  carName: string;
  images: CarImageDTO[];
}

export default function CarGallery({ carName, images }: CarGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (images.length < 2) return;
    prefetchCarImage(images[(activeIndex + 1) % images.length], GALLERY_WIDTH);
    prefetchCarImage(images[(activeIndex - 1 + images.length) % images.length], GALLERY_WIDTH);
  }, [activeIndex, images]);

  useEffect(() => {
    thumbnailRefs.current[activeIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [activeIndex]);

  useEffect(() => {
    if (activeIndex < images.length) return;
    setActiveIndex(0);
  }, [activeIndex, images.length]);

  const goTo = (index: number) => {
    if (images.length === 0) return;
    const nextIndex = (index + images.length) % images.length;
    setActiveIndex(nextIndex);
    const rail = railRef.current;
    if (rail) rail.scrollTo({ left: rail.clientWidth * nextIndex, behavior: 'smooth' });
  };

  const handleScroll = () => {
    const rail = railRef.current;
    if (!rail || rail.clientWidth === 0) return;
    const nextIndex = Math.min(images.length - 1, Math.max(0, Math.round(rail.scrollLeft / rail.clientWidth)));
    if (nextIndex !== activeIndex) setActiveIndex(nextIndex);
  };

  if (images.length === 0) {
    return (
      <CarImage
        image={null}
        alt={`${carName} photo unavailable`}
        sizes="(max-width: 768px) 100vw, 1200px"
        aspect={16 / 9}
        containerClassName="w-full rounded-2xl shadow-card md:aspect-[21/9]"
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-surface-container-low shadow-card">
        <div
          ref={railRef}
          onScroll={handleScroll}
          className="flex aspect-[16/9] w-full snap-x snap-mandatory overflow-x-auto scroll-smooth md:aspect-[21/9] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`${carName} photo gallery`}
        >
          {images.map((image, index) => (
            <div key={image.id} className="h-full min-w-full snap-center snap-always">
              <CarImage
                image={image}
                alt={image.alt || `${carName} - photo ${index + 1}`}
                sizes="(max-width: 768px) 100vw, 1200px"
                priority={index === 0}
                containerClassName="h-full w-full"
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>

        <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur">
          {activeIndex + 1} / {images.length}
        </div>

        {images.length > 1 ? (
          <div className="absolute inset-x-4 top-1/2 hidden -translate-y-1/2 items-center justify-between md:flex">
            <button
              type="button"
              onClick={() => goTo(activeIndex - 1)}
              aria-label="Previous car photo"
              className="flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 active:scale-95"
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => goTo(activeIndex + 1)}
              aria-label="Next car photo"
              className="flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition-colors hover:bg-black/70 active:scale-95"
            >
              <ChevronRight aria-hidden="true" className="size-6" />
            </button>
          </div>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-3 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((image, index) => (
            <button
              key={image.id}
              ref={(node) => {
                thumbnailRefs.current[index] = node;
              }}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Show photo ${index + 1} of ${images.length}`}
              aria-current={activeIndex === index ? 'true' : undefined}
              className={`min-h-11 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition-colors md:w-36 ${
                activeIndex === index ? 'border-primary' : 'border-transparent hover:border-slate-300'
              }`}
            >
              <CarImage
                image={image}
                alt=""
                sizes="(max-width: 768px) 96px, 144px"
                aspect={16 / 9}
                containerClassName="h-full w-full"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
