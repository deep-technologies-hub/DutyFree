import { useState } from 'react';

interface ProductImageProps {
  src?: string;
  alt: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const sizeClasses = {
  small: 'w-8 h-8',
  medium: 'w-12 h-12', 
  large: 'w-16 h-16'
};

export function ProductImage({ src, alt, size = 'medium', className = '' }: ProductImageProps) {
  const [imgError, setImgError] = useState(false);
  
  // Chemin relatif servi par nginx (/media, /static) ; l'image par défaut laisse place aux initiales.
  const imageUrl = src && !imgError && !src.endsWith('/no-image.svg') ? src : null;
  
  if (!imageUrl) {
    // Placeholder avec les initiales du produit
    const initials = alt.split(' ').map(word => word[0]).join('').substring(0, 2).toUpperCase();
    
    return (
      <div className={`${sizeClasses[size]} rounded-lg bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 ${className}`}>
        {initials}
      </div>
    );
  }
  
  return (
    <img
      src={imageUrl}
      alt={alt}
      className={`${sizeClasses[size]} rounded-lg object-cover ${className}`}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
}
