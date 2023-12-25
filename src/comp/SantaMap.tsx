import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Define the types
interface CityData {
  arrival_time_utc: string;
  coordinates: { lat: number; lng: number };
  msg?: string;
}

interface TimeZoneData {
  [city: string]: CityData;
}

interface SantaData {
  [timeZone: string]: TimeZoneData;
}

interface SantaMapProps {
  santaData: SantaData;
}

const santaIcon = new L.Icon({
  iconUrl: '/santa-icon.svg',
  iconSize: [60, 60]
});

const northPoleCoords = { lat: 90, lng: 0 };

const interpolatePosition = (start: { lat: number, lng: number }, end: { lat: number, lng: number }, fraction: number) => {
    return {
        lat: start.lat + (end.lat - start.lat) * fraction,
        lng: start.lng + (end.lng - start.lng) * fraction
    };
};

const SantaMap: React.FC<SantaMapProps> = ({ santaData }) => {
    const [currentPosition, setCurrentPosition] = useState<L.LatLngExpression>([northPoleCoords.lat, northPoleCoords.lng]);
    const [message, setMessage] = useState('');
    const [currentLocationIndex, setCurrentLocationIndex] = useState(0);

    const flattenData = (data: SantaData) => {
        let flatData: Array<{ city: string; coordinates: { lat: number; lng: number }; arrival_time_utc: string; msg?: string }> = [];
        for (const zone in data) {
            for (const city in data[zone]) {
                const { coordinates, arrival_time_utc, msg } = data[zone][city];
                flatData.push({ city, coordinates, arrival_time_utc, msg });
            }
        }
        return flatData;
    };

    useEffect(() => {
        const locations = flattenData(santaData);
        const updatePosition = () => {
            const now = Date.now();
            if (currentLocationIndex < locations.length) {
                const currentLocation = locations[currentLocationIndex];
                const nextLocation = locations[currentLocationIndex + 1] || currentLocation;
                const currentLocationTime = new Date(currentLocation.arrival_time_utc).getTime();
                const nextLocationTime = new Date(nextLocation.arrival_time_utc).getTime();

                if (now >= nextLocationTime) {
                    setCurrentLocationIndex(currentLocationIndex + 1);
                    setMessage(nextLocation.msg || `Santa is currently at ${nextLocation.city}`);
                } else {
                    const fraction = (now - currentLocationTime) / (nextLocationTime - currentLocationTime);
                    const interpolatedPosition = interpolatePosition(currentLocation.coordinates, nextLocation.coordinates, fraction);
                    if (!isNaN(interpolatedPosition.lat) && !isNaN(interpolatedPosition.lng)) {
                        setCurrentPosition([interpolatedPosition.lat, interpolatedPosition.lng]);
                        setMessage(nextLocation.msg || `Heading towards ${nextLocation.city}`);
                    } else {
                        console.error('Invalid interpolated position:', interpolatedPosition);
                        // Optionally set a fallback position or handle the error
                    }
                }
            }
        };

        const interval = setInterval(updatePosition, 1000);
        return () => clearInterval(interval);
    }, [santaData, currentLocationIndex]);

    return (
        <div style={{ height: '100%', width: '100%' }}>
            {message && (
                <div className="message" style={{ fontSize: '1rem', padding: '0.5rem' }}>{message}</div>
            )}
            <MapContainer
                center={[90, 135]}
                zoom={4}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer 
                    url='https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
                />
                <Marker position={currentPosition} icon={santaIcon} />
            </MapContainer>
        </div>
    );
};

export default SantaMap;
