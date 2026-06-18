import React from 'react';

const isImgAvatar = (av) => typeof av === 'string' && av.startsWith('/');

const SIZES = { sm: 28, md: 36, lg: 52, xl: 72 };

const Avatar = ({ avatar, size = 'md', className = '' }) => {
  if (!avatar) return null;
  if (isImgAvatar(avatar)) {
    const px = typeof size === 'number' ? size : SIZES[size] || 36;
    return (
      <img
        src={avatar}
        alt=""
        width={px}
        height={px}
        className={`av-img ${className}`}
        style={{ borderRadius: '50%', objectFit: 'cover', display: 'block', flexShrink: 0 }}
      />
    );
  }
  // 旧 emoji 兼容
  const em = typeof size === 'number' ? `${size * 0.6}px` : { sm: '1.1rem', md: '1.5rem', lg: '2.1rem', xl: '2.8rem' }[size] || '1.5rem';
  return <span className={className} style={{ fontSize: em, lineHeight: 1, flexShrink: 0 }}>{avatar}</span>;
};

export default Avatar;
