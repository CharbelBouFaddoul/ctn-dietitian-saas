import type { ActivityMet } from "./prescription";

/**
 * Curated subset of the Compendium of Physical Activities (Ainsworth et al., 2011),
 * used by the PAL activity builder's searchable picker. MET values are the compendium
 * reference values; labels are simplified for clinical use.
 */
export const ACTIVITY_COMPENDIUM: ActivityMet[] = [
  // ── Rest & sedentary ──
  { key: "sleep", label: "Sleeping", group: "Rest & sedentary", met: 0.95 },
  { key: "lying", label: "Lying quietly, awake", group: "Rest & sedentary", met: 1.3 },
  { key: "reclining_talk", label: "Reclining, talking", group: "Rest & sedentary", met: 1.3 },
  { key: "sitting", label: "Sitting quietly", group: "Rest & sedentary", met: 1.3 },
  { key: "tv", label: "Sitting, watching TV", group: "Rest & sedentary", met: 1.3 },
  { key: "reading_sitting", label: "Sitting, reading", group: "Rest & sedentary", met: 1.3 },
  { key: "writing_sitting", label: "Sitting, writing / desk work", group: "Rest & sedentary", met: 1.3 },
  { key: "standing_quietly", label: "Standing quietly", group: "Rest & sedentary", met: 1.3 },
  { key: "meeting_sitting", label: "Sitting in a meeting", group: "Rest & sedentary", met: 1.5 },

  // ── Personal care ──
  { key: "eating_sitting", label: "Eating (sitting)", group: "Personal care", met: 1.5 },
  { key: "grooming_standing", label: "Grooming (standing)", group: "Personal care", met: 2.0 },
  { key: "showering", label: "Showering, toweling (standing)", group: "Personal care", met: 2.0 },
  { key: "dressing", label: "Dressing / undressing", group: "Personal care", met: 2.5 },
  { key: "bathing_seated", label: "Bathing (seated)", group: "Personal care", met: 1.5 },

  // ── Occupation ──
  { key: "office", label: "Office / computer work (sitting)", group: "Occupation", met: 1.5 },
  { key: "standing_light_work", label: "Standing, light work (bartend, store)", group: "Occupation", met: 3.0 },
  { key: "standing_moderate_work", label: "Standing, moderate work (assembly)", group: "Occupation", met: 3.5 },
  { key: "light_manual", label: "Light manual labor", group: "Occupation", met: 4.0 },
  { key: "heavy_manual", label: "Heavy manual labor (construction)", group: "Occupation", met: 5.5 },
  { key: "carrying_loads", label: "Carrying moderate loads up stairs", group: "Occupation", met: 8.0 },
  { key: "teaching_standing", label: "Teaching / presenting (standing)", group: "Occupation", met: 1.8 },
  { key: "nursing_care", label: "Patient care / nursing", group: "Occupation", met: 3.5 },

  // ── Household ──
  { key: "cooking", label: "Cooking / food prep (standing)", group: "Household", met: 3.3 },
  { key: "washing_dishes", label: "Washing dishes (standing)", group: "Household", met: 1.8 },
  { key: "tidying", label: "Tidying, putting away (light)", group: "Household", met: 2.5 },
  { key: "dusting", label: "Dusting / light cleaning", group: "Household", met: 2.5 },
  { key: "vacuuming", label: "Vacuuming", group: "Household", met: 3.3 },
  { key: "mopping", label: "Mopping / sweeping", group: "Household", met: 3.5 },
  { key: "scrubbing", label: "Scrubbing floors (vigorous)", group: "Household", met: 4.5 },
  { key: "laundry", label: "Laundry, folding", group: "Household", met: 2.0 },
  { key: "ironing", label: "Ironing", group: "Household", met: 1.8 },
  { key: "making_bed", label: "Making the bed", group: "Household", met: 3.3 },
  { key: "multi_household", label: "Multiple household tasks (light)", group: "Household", met: 3.5 },
  { key: "grocery_shopping", label: "Grocery shopping (with cart)", group: "Household", met: 2.3 },
  { key: "childcare_light", label: "Childcare (seated, light)", group: "Household", met: 2.0 },
  { key: "childcare_active", label: "Childcare (active, standing)", group: "Household", met: 3.0 },
  { key: "pet_care", label: "Feeding / grooming pets", group: "Household", met: 2.5 },
  { key: "home_repair", label: "Home repair / DIY (general)", group: "Household", met: 3.0 },
  { key: "painting_home", label: "Painting (home)", group: "Household", met: 3.3 },
  { key: "moving_furniture", label: "Moving furniture / boxes", group: "Household", met: 5.8 },

  // ── Lawn & garden ──
  { key: "gardening_general", label: "Gardening (general)", group: "Lawn & garden", met: 3.8 },
  { key: "weeding", label: "Weeding / cultivating", group: "Lawn & garden", met: 4.5 },
  { key: "mowing_power", label: "Mowing lawn (power mower)", group: "Lawn & garden", met: 4.5 },
  { key: "mowing_push", label: "Mowing lawn (push, hand)", group: "Lawn & garden", met: 6.0 },
  { key: "raking", label: "Raking leaves", group: "Lawn & garden", met: 3.8 },
  { key: "shoveling_snow", label: "Shoveling snow (by hand)", group: "Lawn & garden", met: 6.0 },
  { key: "digging", label: "Digging / spading soil", group: "Lawn & garden", met: 5.0 },
  { key: "watering_plants", label: "Watering plants", group: "Lawn & garden", met: 1.5 },

  // ── Transport ──
  { key: "driving_car", label: "Driving a car", group: "Transport", met: 2.5 },
  { key: "driving_truck", label: "Driving heavy truck / tractor", group: "Transport", met: 2.5 },
  { key: "riding_passenger", label: "Riding in a vehicle", group: "Transport", met: 1.3 },
  { key: "motorcycle", label: "Riding a motorcycle", group: "Transport", met: 3.5 },
  { key: "public_transit_stand", label: "Standing on bus / train", group: "Transport", met: 2.0 },
  { key: "commute_walk", label: "Walking to commute (3 mph)", group: "Transport", met: 3.3 },
  { key: "commute_bike", label: "Cycling to commute", group: "Transport", met: 6.8 },

  // ── Walking ──
  { key: "walk_stroll", label: "Walking, strolling (< 2 mph)", group: "Walking", met: 2.0 },
  { key: "walk_slow", label: "Walking, slow (2 mph)", group: "Walking", met: 2.8 },
  { key: "walk_moderate", label: "Walking, moderate (3 mph)", group: "Walking", met: 3.5 },
  { key: "walk_brisk", label: "Walking, brisk (3.5 mph)", group: "Walking", met: 4.3 },
  { key: "walk_fast", label: "Walking, fast (4 mph)", group: "Walking", met: 5.0 },
  { key: "walk_very_fast", label: "Walking, very fast (4.5 mph)", group: "Walking", met: 7.0 },
  { key: "walk_uphill", label: "Walking uphill (3.5 mph)", group: "Walking", met: 6.0 },
  { key: "walk_dog", label: "Walking the dog", group: "Walking", met: 3.0 },
  { key: "hiking", label: "Hiking, cross-country", group: "Walking", met: 6.0 },
  { key: "backpacking", label: "Backpacking (with load)", group: "Walking", met: 7.0 },
  { key: "stairs_up", label: "Climbing stairs (fast)", group: "Walking", met: 8.8 },
  { key: "stairs_down", label: "Descending stairs", group: "Walking", met: 3.5 },

  // ── Running ──
  { key: "jogging_general", label: "Jogging (general)", group: "Running", met: 7.0 },
  { key: "run_5mph", label: "Running (5 mph / 12 min mile)", group: "Running", met: 8.3 },
  { key: "run_6mph", label: "Running (6 mph / 10 min mile)", group: "Running", met: 9.8 },
  { key: "run_7mph", label: "Running (7 mph)", group: "Running", met: 11.0 },
  { key: "run_8mph", label: "Running (8 mph)", group: "Running", met: 11.8 },
  { key: "run_9mph", label: "Running (9 mph)", group: "Running", met: 12.8 },
  { key: "run_10mph", label: "Running (10 mph)", group: "Running", met: 14.5 },
  { key: "run_trail", label: "Running, cross-country / trail", group: "Running", met: 9.0 },

  // ── Cycling ──
  { key: "cycle_leisure", label: "Cycling, leisure (< 10 mph)", group: "Cycling", met: 4.0 },
  { key: "cycle_light", label: "Cycling, light (10-12 mph)", group: "Cycling", met: 6.8 },
  { key: "cycle_moderate", label: "Cycling, moderate (12-14 mph)", group: "Cycling", met: 8.0 },
  { key: "cycle_vigorous", label: "Cycling, vigorous (14-16 mph)", group: "Cycling", met: 10.0 },
  { key: "cycle_racing", label: "Cycling, racing (16-19 mph)", group: "Cycling", met: 12.0 },
  { key: "cycle_mountain", label: "Mountain biking", group: "Cycling", met: 8.5 },
  { key: "spin_class", label: "Stationary cycling / spin class", group: "Cycling", met: 7.0 },

  // ── Conditioning / gym ──
  { key: "stretching", label: "Stretching / mobility", group: "Conditioning", met: 2.3 },
  { key: "yoga", label: "Yoga (Hatha)", group: "Conditioning", met: 2.5 },
  { key: "yoga_power", label: "Yoga (power / vinyasa)", group: "Conditioning", met: 4.0 },
  { key: "pilates", label: "Pilates", group: "Conditioning", met: 3.0 },
  { key: "resistance_light", label: "Resistance training (light-moderate)", group: "Conditioning", met: 3.5 },
  { key: "resistance_vigorous", label: "Resistance training (vigorous)", group: "Conditioning", met: 6.0 },
  { key: "circuit_training", label: "Circuit training", group: "Conditioning", met: 8.0 },
  { key: "calisthenics_light", label: "Calisthenics (light)", group: "Conditioning", met: 3.5 },
  { key: "calisthenics_vigorous", label: "Calisthenics (vigorous, push-ups)", group: "Conditioning", met: 8.0 },
  { key: "hiit", label: "HIIT / vigorous interval", group: "Conditioning", met: 8.0 },
  { key: "rowing_machine", label: "Rowing machine (moderate)", group: "Conditioning", met: 7.0 },
  { key: "rowing_vigorous", label: "Rowing machine (vigorous)", group: "Conditioning", met: 8.5 },
  { key: "elliptical", label: "Elliptical trainer", group: "Conditioning", met: 5.0 },
  { key: "stair_machine", label: "Stair-treadmill / stepper", group: "Conditioning", met: 9.0 },
  { key: "aerobics_low", label: "Aerobics (low impact)", group: "Conditioning", met: 5.0 },
  { key: "aerobics_high", label: "Aerobics (high impact)", group: "Conditioning", met: 7.3 },
  { key: "rope_jump", label: "Jumping rope", group: "Conditioning", met: 12.3 },

  // ── Sports ──
  { key: "soccer_casual", label: "Soccer (casual)", group: "Sports", met: 7.0 },
  { key: "soccer_competitive", label: "Soccer (competitive)", group: "Sports", met: 10.0 },
  { key: "basketball", label: "Basketball (game)", group: "Sports", met: 8.0 },
  { key: "basketball_shoot", label: "Basketball (shooting around)", group: "Sports", met: 4.5 },
  { key: "tennis_singles", label: "Tennis (singles)", group: "Sports", met: 8.0 },
  { key: "tennis_doubles", label: "Tennis (doubles)", group: "Sports", met: 6.0 },
  { key: "table_tennis", label: "Table tennis", group: "Sports", met: 4.0 },
  { key: "badminton", label: "Badminton (social)", group: "Sports", met: 5.5 },
  { key: "volleyball", label: "Volleyball (casual)", group: "Sports", met: 3.0 },
  { key: "golf_walking", label: "Golf (walking, carrying clubs)", group: "Sports", met: 4.3 },
  { key: "golf_cart", label: "Golf (with cart)", group: "Sports", met: 3.5 },
  { key: "baseball", label: "Baseball / softball", group: "Sports", met: 5.0 },
  { key: "boxing_bag", label: "Boxing (punching bag)", group: "Sports", met: 5.5 },
  { key: "boxing_spar", label: "Boxing (sparring)", group: "Sports", met: 7.8 },
  { key: "martial_arts", label: "Martial arts (moderate)", group: "Sports", met: 10.3 },
  { key: "climbing_rock", label: "Rock climbing", group: "Sports", met: 8.0 },
  { key: "bowling", label: "Bowling", group: "Sports", met: 3.0 },
  { key: "frisbee", label: "Frisbee (general)", group: "Sports", met: 3.0 },
  { key: "skateboarding", label: "Skateboarding", group: "Sports", met: 5.0 },
  { key: "horseback", label: "Horseback riding (general)", group: "Sports", met: 5.5 },

  // ── Water ──
  { key: "swim_leisure", label: "Swimming, leisurely", group: "Water", met: 6.0 },
  { key: "swim_laps_moderate", label: "Swimming laps (moderate)", group: "Water", met: 7.0 },
  { key: "swim_laps_vigorous", label: "Swimming laps (vigorous)", group: "Water", met: 9.8 },
  { key: "water_aerobics", label: "Water aerobics", group: "Water", met: 5.3 },
  { key: "surfing", label: "Surfing", group: "Water", met: 3.0 },
  { key: "kayaking", label: "Kayaking / canoeing", group: "Water", met: 5.0 },
  { key: "paddleboard", label: "Stand-up paddleboarding", group: "Water", met: 6.0 },

  // ── Winter ──
  { key: "ski_downhill", label: "Skiing, downhill (moderate)", group: "Winter", met: 5.3 },
  { key: "ski_cross_country", label: "Skiing, cross-country", group: "Winter", met: 9.0 },
  { key: "snowboarding", label: "Snowboarding", group: "Winter", met: 5.3 },
  { key: "ice_skating", label: "Ice skating", group: "Winter", met: 7.0 },

  // ── Dance ──
  { key: "dance_ballroom_slow", label: "Ballroom dancing (slow)", group: "Dance", met: 3.0 },
  { key: "dance_ballroom_fast", label: "Ballroom dancing (fast)", group: "Dance", met: 5.5 },
  { key: "dance_aerobic", label: "Aerobic / Zumba dancing", group: "Dance", met: 7.3 },
  { key: "dance_general", label: "General dancing (disco, folk)", group: "Dance", met: 4.5 },

  // ── Custom ──
  { key: "other", label: "Other (custom MET)", group: "Custom", met: 2.0 },
];

export function compendiumMet(key: string): number | null {
  return ACTIVITY_COMPENDIUM.find((a) => a.key === key)?.met ?? null;
}
