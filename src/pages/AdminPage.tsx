/**
 * The owner's dashboard.
 *
 * Same page as before — mobile top bar, "System Live" header, three stat cards,
 * filter row, animated fleet grid, "Load More". What changed is that it now runs
 * on `useCars()` instead of four hardcoded Unsplash rows held in `useState`,
 * where every edit died on refresh.
 *
 * Everything customer-facing is derived, never read raw: the availability count
 * goes through `carAvailability()` so a car blocked today is not reported as
 * available (CONTRACT.md §16.2).
 */

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CarFront,
  ChevronDown,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Menu,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useCars, useLocations } from '@/src/hooks';
import { EmptyState, FleetCardSkeleton, StickyActionBar } from '@/src/components/ui';
import { filterCarsByCities } from '@/src/lib/carHelpers';
import { carAvailability } from '@/src/lib/availability';
import { citySlug, cityOptions } from '@/src/lib/locationHelpers';
import type { CarDTO } from '@/src/types/api';
import type { CarFormMode, StatItem } from '@/src/types/admin';
import AdminSidebar from '@/src/components/admin/AdminSidebar';
import AdminStatCard from '@/src/components/admin/AdminStatCard';
import AdminVehicleCard from '@/src/components/admin/AdminVehicleCard';
import CarFormDialog from '@/src/components/admin/CarFormDialog';
import CarImageManager from '@/src/components/admin/CarImageManager';
import HeroImageManager from '@/src/components/admin/HeroImageManager';
import LocationManagerDialog from '@/src/components/admin/LocationManagerDialog';
import { BTN_PRIMARY, BTN_SECONDARY, pillClass } from '@/src/components/admin/adminStyles';

/** Cars revealed per "Load More" press. */
const PAGE_SIZE = 12;

/** The bucket for cars the owner hasn't given a body type — several really haven't one. */
const NO_TYPE = 'No type';
const ALL = 'All';

export default function AdminPage() {
  const carsQuery = useCars();
  const locationsQuery = useLocations();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [cityFilter, setCityFilter] = useState<string>(ALL);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [carForm, setCarForm] = useState<{ open: boolean; mode: CarFormMode }>({
    open: false,
    mode: { mode: 'create' },
  });
  const [imageCarId, setImageCarId] = useState<string | null>(null);
  const [isCityManagerOpen, setCityManagerOpen] = useState(false);
  const [isHeroManagerOpen, setHeroManagerOpen] = useState(false);

  const cars = useMemo(() => carsQuery.data ?? [], [carsQuery.data]);
  const locations = useMemo(() => locationsQuery.data ?? [], [locationsQuery.data]);

  // Two different gates, deliberately (CONTRACT.md §15.4):
  //   - the city filter row appears once there is more than one CITY;
  //   - the per-card branch label appears once there is more than one OFFICE,
  //     because two offices in one city still need telling apart.
  const cities = useMemo(() => cityOptions(locations, cars), [locations, cars]);
  const showCityFilter = cities.length > 1;
  const showBranchOnCards = locations.length > 1;

  const stats: StatItem[] = useMemo(() => {
    const total = cars.length;
    const available = cars.filter((c) => carAvailability(c).kind === 'available').length;
    const outOnDates = cars.filter((c) => carAvailability(c).kind === 'booked').length;
    const featured = cars.filter((c) => c.isFeatured).length;
    // A car with no branch belongs here: it is invisible to any customer who has
    // picked a city (CONTRACT.md §15.5), and this tile is the only place the
    // owner would ever find that out.
    const needsAttention = cars.filter(
      (c) => c.pricePerDay === 0 || c.images.length === 0 || c.location === null,
    ).length;

    // Every trend string below is computed from the fleet. The originals
    // ('+2 this month', '85% utilization rate', '3 due for release today') were
    // invented numbers, which .github/copilot-instructions.md forbids.
    return [
      {
        label: 'Total Cars',
        value: total,
        trend: `${featured} featured on the home page`,
        trendIcon: 'up',
        variant: 'primary',
      },
      {
        label: 'Available Now',
        value: available,
        trend: `${outOnDates} out on booked dates`,
        trendIcon: 'check',
        variant: 'success',
      },
      {
        label: 'Needs Attention',
        value: needsAttention,
        trend: `${total - needsAttention} of ${total} ready to publish`,
        trendIcon: 'build',
        variant: 'warning',
      },
    ];
  }, [cars]);

  const categories = useMemo(() => {
    const types = [...new Set(cars.map((c) => c.carType).filter((t): t is string => !!t))].sort();
    const hasUntyped = cars.some((c) => !c.carType);
    return [ALL, ...types, ...(hasUntyped ? [NO_TYPE] : [])];
  }, [cars]);

  const filteredCars = useMemo(() => {
    const byCity = cityFilter === ALL ? cars : filterCarsByCities(cars, [cityFilter]);
    if (categoryFilter === ALL) return byCity;
    if (categoryFilter === NO_TYPE) return byCity.filter((c) => !c.carType);
    return byCity.filter((c) => c.carType === categoryFilter);
  }, [cars, cityFilter, categoryFilter]);

  const visibleCars = filteredCars.slice(0, visibleCount);
  const hasMore = filteredCars.length > visibleCars.length;

  /** Any filter change starts the reveal over, or "Load More" would look stuck. */
  function applyCategory(value: string) {
    setCategoryFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function applyCity(value: string) {
    setCityFilter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function openCreate() {
    setCarForm({ open: true, mode: { mode: 'create' } });
  }

  function openEdit(car: CarDTO) {
    setCarForm({ open: true, mode: { mode: 'edit', car } });
  }

  // Looked up from the live list rather than held as a snapshot, so uploads and
  // reorders inside the manager re-render it immediately.
  const imageCar = imageCarId ? (cars.find((c) => c.id === imageCarId) ?? null) : null;
  const nextSortOrder = cars.reduce((max, c) => Math.max(max, c.sortOrder), -1) + 1;

  return (
    <div className="flex min-h-dvh bg-surface-container-low/40">
      <AdminSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onAddCar={openCreate}
      />

      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-8">
        {/* Mobile Top Bar */}
        <div className="sticky top-0 z-40 -mx-4 -mt-4 mb-6 flex min-h-16 items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-2 text-white md:hidden">
          <h2 className="min-w-0 truncate text-sm font-black tracking-tighter">Sri Venkateshwara Admin</h2>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open admin navigation"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-white hover:bg-slate-800 active:scale-95"
          >
            <Menu className="size-6" aria-hidden="true" />
          </button>
        </div>

        {/* Header */}
        <header className="mb-8 flex flex-col gap-5 md:mb-10 md:flex-row md:items-end md:justify-between md:gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tighter text-primary">Fleet Management</h1>
            <p className="text-slate-500 font-medium text-sm md:text-base">Oversee your premium assets and live availability.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex min-h-11 items-center gap-2" aria-label="System live">
              <span className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Live</span>
            </div>

            <Link to="/admin/availability" className={`${BTN_SECONDARY} flex min-h-11 items-center gap-2`}>
              <CalendarDays className="w-4 h-4" />
              Availability
            </Link>

            <button
              type="button"
              onClick={() => setCityManagerOpen(true)}
              className={`${BTN_SECONDARY} flex min-h-11 items-center gap-2`}
            >
              <MapPin className="w-4 h-4" />
              Manage Cities
            </button>

            <button
              type="button"
              onClick={() => setHeroManagerOpen(true)}
              className={`${BTN_SECONDARY} flex min-h-11 items-center gap-2`}
            >
              <ImageIcon className="w-4 h-4" />
              Homepage Image
            </button>

            <button type="button" onClick={openCreate} className={`${BTN_PRIMARY} flex min-h-11 items-center gap-2`}>
              <Plus className="w-4 h-4" />
              Add Car
            </button>
          </div>
        </header>

        {/* Stats Overview */}
        <section className="mb-8 grid grid-cols-2 gap-3 md:mb-10 md:grid-cols-3 md:gap-6">
          {stats.map((stat, index) => (
            <div key={stat.label} className={index === 2 ? 'col-span-2 md:col-span-1' : ''}>
              <AdminStatCard {...stat} />
            </div>
          ))}
        </section>

        {/* Fleet Grid */}
        <section>
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
            <h2 className="text-xl font-extrabold tracking-tighter text-slate-900">Active Inventory</h2>
            <div className="flex flex-col md:flex-row gap-1 md:gap-4">
              <div className="flex gap-1 md:gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => applyCategory(cat)}
                    className={`${pillClass(categoryFilter === cat)} min-h-11`}
                    style={{ fontSize: '0.75rem' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/*
                Renders nothing below two cities: with one office the filter row
                must look exactly as it did before the multi-city amendment.
              */}
              {showCityFilter && (
                <div className="flex gap-1 md:gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar md:border-l md:border-slate-200 md:pl-4">
                  <button
                    onClick={() => applyCity(ALL)}
                    className={`${pillClass(cityFilter === ALL)} min-h-11`}
                    style={{ fontSize: '0.75rem' }}
                  >
                    All Cities
                  </button>
                  {cities.map((city) => (
                    <button
                      key={city.slug}
                      onClick={() => applyCity(city.slug)}
                      className={`${pillClass(cityFilter === city.slug)} min-h-11`}
                      style={{ fontSize: '0.75rem' }}
                    >
                      {city.city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {carsQuery.isPending ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <FleetCardSkeleton key={i} />
              ))}
            </div>
          ) : carsQuery.isError ? (
            <EmptyState
              variant="panel"
              icon={RefreshCw}
              title="Could not load the fleet"
              description={carsQuery.error?.message ?? 'The API did not respond.'}
              className="bg-white shadow-card"
              action={(
                <button
                  type="button"
                  onClick={() => void carsQuery.refetch()}
                  disabled={carsQuery.isFetching}
                  className={`${BTN_PRIMARY} inline-flex min-h-11 items-center gap-2`}
                >
                  {carsQuery.isFetching ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw className="size-4" aria-hidden="true" />
                  )}
                  Try Again
                </button>
              )}
            />
          ) : filteredCars.length === 0 ? (
            <EmptyState
              variant="panel"
              icon={CarFront}
              title={cars.length === 0 ? 'No cars yet' : 'No cars match this filter'}
              description={cars.length === 0
                ? 'Add your first car to start showing it to customers.'
                : 'Clear the filters to see the rest of the fleet.'}
              className="bg-white shadow-card"
              action={(
                <button
                  type="button"
                  onClick={cars.length === 0 ? openCreate : () => {
                    applyCategory(ALL);
                    applyCity(ALL);
                  }}
                  className={`${BTN_PRIMARY} inline-flex min-h-11 items-center gap-2`}
                >
                  {cars.length === 0 && <Plus className="size-4" aria-hidden="true" />}
                  {cars.length === 0 ? 'Add Car' : 'Clear Filters'}
                </button>
              )}
            />
          ) : (
            <motion.div
              layout
              className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-8"
            >
              <AnimatePresence mode="popLayout">
                {visibleCars.map((car) => (
                  <AdminVehicleCard
                    key={car.id}
                    car={car}
                    showBranch={showBranchOnCards}
                    onEditSpecs={openEdit}
                    onManageImages={(c) => setImageCarId(c.id)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          )}

          {/* Pagination — reveals in pages of 12 and disappears once everything is shown. */}
          {hasMore && (
            <div className="mt-12 flex justify-center pb-8">
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="flex items-center gap-2 px-10 py-4 bg-white text-primary border border-primary/20 rounded-full font-bold uppercase tracking-widest text-xs hover:bg-primary/5 transition-all shadow-md active:scale-95"
              >
                Load More Vehicles
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>

        <StickyActionBar hideFrom="md">
          <button
            type="button"
            onClick={openCreate}
            className={`${BTN_PRIMARY} flex min-h-11 w-full items-center justify-center gap-2`}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add Car
          </button>
        </StickyActionBar>
      </main>

      <CarFormDialog
        open={carForm.open}
        mode={carForm.mode}
        nextSortOrder={nextSortOrder}
        carTypes={categories.filter((c) => c !== ALL && c !== NO_TYPE)}
        onClose={() => setCarForm((prev) => ({ ...prev, open: false }))}
        // Straight into the photo manager: a car with no images is one of the
        // three things the "Needs Attention" tile is counting.
        onCreated={(car) => setImageCarId(car.id)}
      />

      {imageCar && (
        <CarImageManager open car={imageCar} onClose={() => setImageCarId(null)} />
      )}

      <LocationManagerDialog open={isCityManagerOpen} onClose={() => setCityManagerOpen(false)} />

      <HeroImageManager open={isHeroManagerOpen} onClose={() => setHeroManagerOpen(false)} />
    </div>
  );
}
