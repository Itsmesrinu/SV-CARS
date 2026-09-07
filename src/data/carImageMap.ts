/**
 * Car data file — built strictly from existing workspace folders.
 *
 * - Every entry maps 1-to-1 to a real folder in the project root.
 * - Image paths are exact filenames found on disk (no invented files).
 * - display name, seating, fuel, and carType are derived from the folder
 *   name ONLY where unambiguous.  Fields that cannot be derived are omitted.
 * - Images are ordered per spec:
 *     main_front_1 ? front_1/front_2 ? inside_1 ? inside_2 ? inside_3
 *     ? side_1 ? side_2 ? back_1
 *   (only files that actually exist are listed)
 */

export interface CarData {
  id: string;
  folderName: string;
  displayName: string;
  /** Vehicle body type — only set when explicitly present in folder name */
  carType?: string;
  seating?: number;
  fuel?: string;
  /** Ordered gallery images (relative to project root, prefixed with /) */
  images: string[];
  availability: boolean;
}

export const carData: CarData[] = [
  // -- Force Traveller Mini Bus ------------------------------
  {
    id: 'force-traveller-mini-bus',
    folderName: 'Force_Traveller_Mini_Bus_26_Seater_Diesel',
    displayName: 'Force Traveller Mini Bus',
    carType: 'Mini Bus',
    seating: 26,
    fuel: 'Diesel',
    images: [
      '/Force_Traveller_Mini_Bus_26_Seater_Diesel/main_front_1.webp',
      '/Force_Traveller_Mini_Bus_26_Seater_Diesel/side_1.webp',
    ],
    availability: true,
  },

  // -- Force Trax Cruiser ------------------------------------
  {
    id: 'force-trax-cruiser',
    folderName: 'Force_Trax_Cruiser_13_Seater_Diesel',
    displayName: 'Force Trax Cruiser',
    // carType not set — "Cruiser" is part of the model name, not a body type
    seating: 13,
    fuel: 'Diesel',
    images: [
      '/Force_Trax_Cruiser_13_Seater_Diesel/main_front_1.webp',
      '/Force_Trax_Cruiser_13_Seater_Diesel/front_2.webp',
      '/Force_Trax_Cruiser_13_Seater_Diesel/side_1.webp',
      '/Force_Trax_Cruiser_13_Seater_Diesel/side_2.webp',
    ],
    availability: true,
  },

  // -- Toyota Innova Crysta ----------------------------------
  {
    id: 'toyota-innova-crysta',
    folderName: 'Toyota_Innova_Crysta_8_Seater_Diesel',
    displayName: 'Toyota Innova Crysta',
    seating: 8,
    fuel: 'Diesel',
    images: [
      '/Toyota_Innova_Crysta_8_Seater_Diesel/main_front_1.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/front_2.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/inside_1.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/inside_2.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/side_1.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/side_2.webp',
      '/Toyota_Innova_Crysta_8_Seater_Diesel/back_1.webp',
    ],
    availability: true,
  },

  // -- Maruti Suzuki Dzire -----------------------------------
  {
    id: 'maruti-suzuki-dzire',
    folderName: 'Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG',
    displayName: 'Maruti Suzuki Dzire',
    seating: 5,
    fuel: 'Petrol/CNG',
    images: [
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/main_front_1.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/inside_1.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/inside_2.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/inside_3.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/side_1.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/side_2.webp',
      '/Maruti_Suzuki_Dzire_5_Seater_Petrol_CNG/back_1.webp',
    ],
    availability: true,
  },

  // -- Toyota Innova -----------------------------------------
  {
    id: 'toyota-innova',
    folderName: 'Toyota_Innova_8_Seater_Petrol',
    displayName: 'Toyota Innova',
    seating: 8,
    fuel: 'Petrol',
    images: [
      '/Toyota_Innova_8_Seater_Petrol/main_front_1.webp',
      '/Toyota_Innova_8_Seater_Petrol/inside_1.webp',
      '/Toyota_Innova_8_Seater_Petrol/inside_2.webp',
      '/Toyota_Innova_8_Seater_Petrol/inside_3.webp',
      '/Toyota_Innova_8_Seater_Petrol/side_1.webp',
    ],
    availability: true,
  },

  // -- Toyota Glanza -----------------------------------------
  {
    id: 'toyota-glanza',
    folderName: 'Toyota_Glanza_5_Seater_Petrol',
    displayName: 'Toyota Glanza',
    seating: 5,
    fuel: 'Petrol',
    images: [
      '/Toyota_Glanza_5_Seater_Petrol/main_front_1.webp',
      '/Toyota_Glanza_5_Seater_Petrol/inside_1.webp',
      '/Toyota_Glanza_5_Seater_Petrol/inside_2.webp',
      // inside_3 does not exist; inside_4.webp is present instead
      '/Toyota_Glanza_5_Seater_Petrol/inside_4.webp',
      '/Toyota_Glanza_5_Seater_Petrol/side_1.webp',
      '/Toyota_Glanza_5_Seater_Petrol/side_2.webp',
      '/Toyota_Glanza_5_Seater_Petrol/back_1.webp',
    ],
    availability: true,
  },

  // -- Maruti Suzuki Ertiga ----------------------------------
  {
    id: 'maruti-suzuki-ertiga',
    folderName: 'Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol',
    displayName: 'Maruti Suzuki Ertiga',
    carType: 'MPV',
    seating: 7,
    fuel: 'Petrol',
    images: [
      '/Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/main_front_1.webp',
      '/Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/inside_1.webp',
      // actual filename on disk has double extension
      '/Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/inside_2.jpg.webp',
      '/Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/side_1.webp',
      '/Maruti_Suzuki_Ertiga_MPV_7_Seater_Petrol/side_2.webp',
    ],
    availability: true,
  },

  // -- Mahindra Scorpio --------------------------------------
  {
    id: 'mahindra-scorpio',
    folderName: 'Mahindra_Scorpio_SUV_9_Seater_Diesel',
    displayName: 'Mahindra Scorpio',
    carType: 'SUV',
    seating: 9,
    fuel: 'Diesel',
    images: [
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/main_front_1.webp',
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/inside_1.webp',
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/inside_2.webp',
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/inside_3.webp',
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/side_1.webp',
      '/Mahindra_Scorpio_SUV_9_Seater_Diesel/side_2.webp',
    ],
    availability: true,
  },
];
