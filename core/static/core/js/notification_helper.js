// Centralized notification helper with mobile support
function showNotification(message, type) {
  const notification = document.createElement("div");
  notification.textContent = message;
  
  const isMobile = window.matchMedia("(orientation: portrait)").matches;
  const bgColor = type === "warning" ? "#FF9800" : "#4CAF50";
  
  notification.style.cssText = `
    position: fixed;
    top: ${isMobile ? '5rem' : '4rem'};
    left: 50%;
    transform: translateX(-50%);
    background: ${bgColor};
    color: white;
    padding: ${isMobile ? '16px 32px' : '12px 24px'};
    border-radius: ${isMobile ? '8px' : '6px'};
    z-index: 9999;
    font-weight: 500;
    font-size: ${isMobile ? '1.1rem' : '1rem'};
    max-width: ${isMobile ? '90%' : 'auto'};
    text-align: center;
  `;
  
  document.body.appendChild(notification);
  const duration = type === "warning" ? 20000 : 2000;
  setTimeout(() => notification.remove(), duration);
  return notification;
}
