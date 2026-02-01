import React from 'react';

const WhatsAppButton = () => {
  const phoneNumber = '919085287242'; // WhatsApp format: country code + number (without +)
  const message = "Hello, I'm interested in learning more about Adhyant's programs and would love to explore how you can help me achieve my academic goals. Could you please share more details?";
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

  return (
    <a 
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-float"
      aria-label="Chat on WhatsApp"
    >
      <svg 
        viewBox="0 0 32 32" 
        xmlns="http://www.w3.org/2000/svg"
        className="whatsapp-icon"
      >
        <path 
          fill="currentColor" 
          d="M16 0c-8.837 0-16 7.163-16 16 0 2.825 0.737 5.607 2.137 8.048l-2.137 7.952 7.933-2.127c2.42 1.37 5.173 2.127 8.067 2.127 8.837 0 16-7.163 16-16s-7.163-16-16-16zM16 29.467c-2.482 0-4.908-0.646-7.07-1.87l-0.507-0.292-5.293 1.785 1.839-5.28-0.321-0.532c-1.364-2.257-2.081-4.832-2.081-7.479 0-7.793 6.34-14.133 14.133-14.133s14.133 6.34 14.133 14.133-6.34 14.133-14.133 14.133zM21.933 18.507c-0.291-0.147-1.725-0.852-1.993-0.948-0.267-0.099-0.461-0.147-0.656 0.147s-0.753 0.948-0.923 1.144c-0.17 0.196-0.339 0.221-0.631 0.073-0.291-0.147-1.229-0.453-2.341-1.445-0.865-0.771-1.449-1.723-1.619-2.015s-0.018-0.452 0.128-0.598c0.132-0.132 0.291-0.344 0.437-0.516 0.147-0.17 0.196-0.291 0.293-0.487 0.099-0.196 0.049-0.367-0.025-0.516s-0.656-1.582-0.899-2.167c-0.236-0.569-0.476-0.492-0.656-0.501-0.17-0.008-0.364-0.010-0.559-0.010s-0.516 0.073-0.786 0.367c-0.267 0.291-1.023 1.001-1.023 2.441s1.048 2.832 1.194 3.027c0.147 0.196 2.067 3.156 5.008 4.426 0.699 0.303 1.245 0.484 1.67 0.619 0.703 0.223 1.342 0.191 1.847 0.116 0.564-0.084 1.725-0.706 1.968-1.387s0.243-1.267 0.17-1.387c-0.073-0.123-0.267-0.196-0.559-0.344z"
        />
      </svg>
    </a>
  );
};

export default WhatsAppButton;
