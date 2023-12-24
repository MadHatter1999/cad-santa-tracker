import React, { useState } from 'react';
import SantaMap from './comp/SantaMap';
import santaData from './santaData.json';
import './css/App.css'; // Import your custom CSS file for styling

const App: React.FC = () => {
  const [timeMultiplier, setTimeMultiplier] = useState<number>(1); // Initialize timeMultiplier state
  const [mapClickBlocked, setMapClickBlocked] = useState<boolean>(false);

  // Function to handle time acceleration buttons
  const handleTimeChange = (multiplier: number) => {
    setTimeMultiplier(multiplier);
  };

  // Function to block map clicks
  const blockMapClick = () => {
    setMapClickBlocked(true);
    setTimeout(() => {
      setMapClickBlocked(false);
    }, 100); // Adjust the timeout value as needed
  };

  return (
    <div className="app-container">
      <header className="header">
        <h2>Santa Tracker</h2>
      </header>
      <main className="main-content">
        {/* Overlay element to block map clicks */}
        {mapClickBlocked && <div className="map-click-blocker" onClick={blockMapClick}></div>}
        <SantaMap santaData={santaData} /> {/* Pass timeMultiplier prop */}
      </main>
      <footer className="footer">Tony's Santa Tracker©</footer>
    </div>
  );
};

export default App;
