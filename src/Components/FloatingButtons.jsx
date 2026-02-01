import React from 'react';
import InfoButton from './Pages/InfoButton';
import InstagramButton from './Pages/InstagramButton';
import WhatsAppButton from './Pages/WhatsAppButton';

const FloatingButtons = () => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: 99999
    }}>
      <div style={{ pointerEvents: 'auto' }}>
        <InfoButton />
        <InstagramButton />
        <WhatsAppButton />
      </div>
    </div>
  );
};

export default FloatingButtons;
