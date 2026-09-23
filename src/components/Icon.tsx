import {
  Baby, Banknote, Bike, BookOpen, Briefcase, Bus, Cake, Car, CarTaxiFront, CircleEllipsis, Coffee, Coins, CreditCard,
  Droplets, Dumbbell, Fuel, Gamepad2, Gift, GraduationCap, Hammer, HandHeart, HeartPulse, House, Landmark, Moon,
  Percent, Phone, PiggyBank, Pill, Plane, Receipt, Scissors, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sofa,
  Sprout, Star, Stethoscope, Store, Tag, Tractor, Tv, Users, Utensils, Wallet, Wifi, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

export const ICONS: Record<string, LucideIcon> = {
  banknote: Banknote, smartphone: Smartphone, landmark: Landmark, wallet: Wallet, 'credit-card': CreditCard,
  'piggy-bank': PiggyBank, coins: Coins, utensils: Utensils, 'shopping-basket': ShoppingBasket, coffee: Coffee,
  car: Car, 'car-taxi-front': CarTaxiFront, fuel: Fuel, bus: Bus, bike: Bike, home: House, zap: Zap, droplets: Droplets,
  users: Users, baby: Baby, 'heart-pulse': HeartPulse, pill: Pill, stethoscope: Stethoscope, shirt: Shirt,
  'graduation-cap': GraduationCap, book: BookOpen, 'hand-heart': HandHeart, receipt: Receipt,
  'circle-ellipsis': CircleEllipsis, briefcase: Briefcase, percent: Percent, wrench: Wrench, gift: Gift, plane: Plane,
  phone: Phone, wifi: Wifi, gamepad: Gamepad2, dumbbell: Dumbbell, scissors: Scissors, store: Store,
  'shopping-bag': ShoppingBag, hammer: Hammer, tv: Tv, sofa: Sofa, cake: Cake, moon: Moon, star: Star, tag: Tag,
  tractor: Tractor, sprout: Sprout,
};

export const ICON_NAMES = Object.keys(ICONS);

export const COLORS = [
  '#16a34a', '#0f766e', '#0891b2', '#0ea5e9', '#2563eb', '#6366f1', '#7c3aed', '#9333ea',
  '#db2777', '#ec4899', '#ef4444', '#ea580c', '#f97316', '#eab308', '#a16207', '#64748b',
];

export function Icon({ name, className = 'size-5' }: { name: string; className?: string }) {
  const C = ICONS[name] ?? CircleEllipsis;
  return <C className={className} aria-hidden />;
}

/** Round coloured badge with an icon, used for wallets and categories. */
export function IconBadge({ name, color, size = 'md' }: { name: string; color: string; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10';
  const icon = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-6' : 'size-5';
  return (
    <span className={`${box} inline-flex shrink-0 items-center justify-center rounded-full text-white`} style={{ backgroundColor: color }}>
      <Icon name={name} className={icon} />
    </span>
  );
}
