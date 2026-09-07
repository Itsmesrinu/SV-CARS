import { Car, Instagram, MapPin, Star } from 'lucide-react';
import { Link } from 'react-router-dom';

import AvailableCars from '../components/AvailableCars';
import BackToTop from '../components/BackToTop';
import BrandLogos from '../components/BrandLogos';
import CitySelector from '../components/CitySelector';
import Hero from '../components/Hero';
import OfficeLocation from '../components/OfficeLocation';
import ShareLocation from '../components/ShareLocation';
import Testimonials from '../components/Testimonials';
import VideoGallery from '../components/VideoGallery';

function ExploreSection() {
  const actionBase =
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 px-3 py-2.5 text-xs font-bold transition-colors active:scale-95 sm:text-sm';
  const secondaryAction = `${actionBase} border-slate-200 bg-surface text-slate-700 hover:border-primary/30 hover:bg-primary/5 hover:text-primary`;

  return (
    <nav aria-label="Explore" className="mx-auto max-w-7xl px-4 pb-8 md:px-6 md:pb-12">
      <div className="grid grid-cols-2 gap-2 md:flex md:gap-3">
        <Link
          to="/all-cars"
          className={`${actionBase} border-primary bg-primary text-white shadow-sm hover:bg-primary/90`}
        >
          <Car aria-hidden="true" className="size-[18px] shrink-0" />
          All Cars
        </Link>
        <a href="#reviews" className={secondaryAction}>
          <Star aria-hidden="true" className="size-[18px] shrink-0" />
          Reviews
        </a>
        <a href="#location" className={secondaryAction}>
          <MapPin aria-hidden="true" className="size-[18px] shrink-0" />
          Office Location
        </a>
        <a
          href="https://www.instagram.com/carssrivenkateshwara?igsh=MW9tcXBlbzB5M3ZhNw=="
          target="_blank"
          rel="noopener noreferrer"
          className={`${actionBase} border-tertiary-container/20 bg-tertiary-container/10 text-tertiary-container hover:border-tertiary-container/40 hover:bg-tertiary-container/15`}
        >
          <Instagram aria-hidden="true" className="size-[18px] shrink-0" />
          Instagram
        </a>
      </div>
    </nav>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <ExploreSection />
      <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
        <CitySelector />
      </div>
      <AvailableCars />
      {/* Hidden for now — kept for later use. */}
      {/* <BrandLogos /> */}
      <VideoGallery />
      <Testimonials />
      <OfficeLocation />
      <ShareLocation />
      <BackToTop />
    </>
  );
}
