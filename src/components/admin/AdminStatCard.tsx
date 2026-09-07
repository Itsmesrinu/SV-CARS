import { TrendingUp, CheckCircle, Wrench, Car } from 'lucide-react';
import { motion } from 'motion/react';
import type { StatItem } from '../../types/admin';
import { CARD } from './adminStyles';

export default function AdminStatCard(props: StatItem) {
  const { label, value, trend, trendIcon, variant } = props;
  const getVariantStyles = () => {
    switch (variant) {
      case 'primary':
        return 'bg-primary text-white';
      case 'success':
        return 'bg-white border-b-4 border-emerald-500';
      case 'warning':
        return 'bg-white border-b-4 border-tertiary-container';
      default:
        return 'bg-white';
    }
  };

  const Icon = () => {
    switch (trendIcon) {
      case 'up': return <TrendingUp className="w-4 h-4" />;
      case 'check': return <CheckCircle className="w-4 h-4" />;
      case 'build': return <Wrench className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <motion.div
      whileHover={{ y: -5 }}
      className={`${CARD} group relative h-full overflow-hidden p-4 active:scale-[0.98] md:p-6 ${getVariantStyles()}`}
    >
      {variant === 'primary' && (
        <div className="absolute -right-4 -bottom-4 opacity-10 transition-transform group-hover:scale-110">
          <Car className="w-24 h-24" />
        </div>
      )}

      <p className={`text-xs uppercase tracking-widest font-bold mb-2 ${variant === 'primary' ? 'opacity-70' : 'text-slate-500'}`}>
        {label}
      </p>
      <h3 className="text-3xl font-extrabold tracking-tighter md:text-4xl">
        {value}
      </h3>

      {trend && (
        <div className={`mt-3 flex items-start gap-1 text-xs font-medium md:mt-4 ${
          variant === 'primary' ? 'text-blue-200' :
          variant === 'success' ? 'text-emerald-600' : 'text-tertiary-container'
        }`}>
          <Icon />
          <span>{trend}</span>
        </div>
      )}
    </motion.div>
  );
}
