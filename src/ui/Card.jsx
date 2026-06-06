import React from 'react';

const SUIT_MAP = {
  '♥': { symbol: '♥', color: 'suit-heart' },
  '♦': { symbol: '♦', color: 'suit-diamond' },
  '♠': { symbol: '♠', color: 'suit-spade' },
  '♣': { symbol: '♣', color: 'suit-club' }
};

const Card = ({ card, flipped, size = 'normal', className = '' }) => {
  const suitInfo = card ? SUIT_MAP[card.suit] : null;
  const sizeClass = size === 'small' ? 'card-small' : size === 'mini' ? 'card-mini' : '';

  return (
    <div className={`card ${flipped ? 'flipped' : ''} ${sizeClass} ${className}`}>
      <div className={`card-face card-front ${suitInfo?.color || ''}`}>
        {card && !flipped && (
          <>
            <div className="card-corner corner-tl">
              <span className="corner-value">{card.value}</span>
            </div>

            <div className="card-center-suit">
              <span className="center-suit-symbol">{card.suit}</span>
            </div>

            <div className="card-corner corner-br">
              <span className="corner-value">{card.value}</span>
            </div>
          </>
        )}
      </div>

      <div className="card-face card-back">
        <div className="card-back-inner">
          <div className="card-back-pattern"></div>
        </div>
      </div>
    </div>
  );
};

export default Card;
