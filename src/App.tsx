import React, { useState, useEffect } from 'react';
import SantaMap from './comp/SantaMap';
import santaData from './santaData.json';
import './css/App.css';

const App: React.FC = () => {
  const [messages, setMessages] = useState<{ id: number, text: string }[]>([]);

  // Function to add a new message
  const addMessage = (text: string) => {
    const newMessage = { id: Date.now(), text };
    setMessages([...messages, newMessage]);
  };

  // Function to remove a message by id
  const removeMessage = (id: number) => {
    setMessages(messages.filter(message => message.id !== id));
  };

  // Automatically add and remove messages
  useEffect(() => {
    const timer = setInterval(() => {
      addMessage("Merry Christmas!");
      setTimeout(() => {
        if (messages.length > 0) {
          removeMessage(messages[0].id);
        }
      }, 4000); // Message display duration
    }, 5000); // Interval between messages

    return () => clearInterval(timer);
  }, [messages]);

  return (
    <div className="app-container">
      <header className="header">
        <h2>Santa Tracker</h2>
      </header>
      <main className="main-content">
        {messages.map((message, index) => (
          <div key={message.id} className="message" style={{ top: `${10 + index * 5}%` }}>
            {message.text}
          </div>
        ))}
        <SantaMap santaData={santaData} />
      </main>
      <footer className="footer">Tony's Santa Tracker©</footer>
    </div>
  );
};

export default App;
