(() => {
  const armies = {
    "Beastmen Brayherds": [
      ["Ungor Raiders", 25, 25], ["Ungor Herds", 25, 25], ["Gor Herds", 25, 25], ["Bestigor Herds", 30, 30],
      ["Chaos Warhounds", 25, 50], ["Centigor Herds", 30, 60], ["Minotaur Herds", 50, 50],
      ["Dragon Ogres", 50, 75], ["Razorgor Herds", 50, 75], ["Tuskgor Chariots", 50, 100], ["Razorgor Chariots", 50, 100]
    ],
    "Kingdom of Bretonnia": [
      ["Peasant Bowmen", 25, 25], ["Men-at-Arms", 25, 25], ["Foot Knights", 25, 25],
      ["Mounted Knights of the Realm", 30, 60], ["Knights Errant", 30, 60], ["Questing Knights", 30, 60],
      ["Grail Knights", 30, 60], ["Pegasus Knights", 50, 50], ["Mounted Yeomen", 30, 60], ["Grail Reliquae", 60, 100]
    ],
    "Tomb Kings of Khemri": [
      ["Skeleton Warriors", 25, 25], ["Skeleton Archers", 25, 25], ["Tomb Guard", 25, 25],
      ["Skeleton Horsemen", 30, 60], ["Skeleton Horse Archers", 30, 60], ["Necropolis Knights", 50, 100],
      ["Sepulchral Stalkers", 50, 100], ["Ushabti", 50, 50], ["Carrion", 40, 40],
      ["Skeleton Chariots", 50, 100], ["Necrolith Colossus", 60, 100], ["Warsphinx", 100, 150]
    ],
    "Orc & Goblin Tribes": [
      ["Orc Boy Mobs", 30, 30], ["Orc Arrer Boy Mobs", 30, 30], ["Black Orc Mobs", 30, 30],
      ["Goblin Mobs", 25, 25], ["Night Goblin Mobs", 25, 25], ["Orc Boar Boy Mobs", 30, 60],
      ["Goblin Wolf Rider Mobs", 25, 50], ["Goblin Spider Rider Mobs", 25, 50], ["Squig Herds", 25, 25],
      ["Snotling Mobs", 40, 40], ["Troll Mobs", 40, 40], ["Orc Boar Chariots", 50, 100], ["Goblin Wolf Chariots", 50, 100]
    ],
    "Warriors of Chaos": [
      ["Chaos Warriors", 30, 30], ["Chaos Marauders", 25, 25], ["Forsaken", 30, 30],
      ["Chaos Knights", 30, 60], ["Marauder Horsemen", 30, 60], ["Chaos Warhounds", 25, 50],
      ["Chosen Chaos Warriors", 30, 30], ["Chosen Chaos Knights", 30, 60], ["Dragon Ogres", 50, 75],
      ["Chaos Ogres", 40, 40], ["Chaos Trolls", 40, 40], ["Chaos Chariots", 50, 100]
    ],
    "Empire of Man": [
      ["State Troops", 25, 25], ["Empire Archers", 25, 25], ["Free Company Militia", 25, 25],
      ["Greatswords", 25, 25], ["Flagellants", 25, 25], ["Empire Knights", 30, 60],
      ["Demigryph Knights", 50, 75], ["Pistoliers", 30, 60], ["Outriders", 30, 60],
      ["War Wagons", 50, 100]
    ],
    "Dwarfen Mountain Holds": [
      ["Dwarf Warriors", 25, 25], ["Quarrellers", 25, 25], ["Thunderers", 25, 25], ["Rangers", 25, 25],
      ["Longbeards", 25, 25], ["Hammerers", 25, 25], ["Ironbreakers", 25, 25], ["Miners", 25, 25],
      ["Slayers", 25, 25], ["Doomseekers", 25, 25]
    ],
    "High Elf Realms": [
      ["Elven Spearmen", 25, 25], ["Elven Archers", 25, 25], ["Lothern Sea Guard", 25, 25],
      ["Swordmasters of Hoeth", 25, 25], ["White Lions of Chrace", 25, 25], ["Phoenix Guard", 25, 25],
      ["Silver Helms", 30, 60], ["Dragon Princes", 30, 60], ["Ellyrian Reavers", 30, 60],
      ["Tiranoc Chariots", 50, 100], ["Lion Chariots of Chrace", 50, 100], ["War Lions", 30, 60],
      ["Chracian Woodsmen", 25, 25], ["Lion Guard", 25, 25]
    ],
    "Wood Elf Realms": [
      ["Glade Guard", 25, 25], ["Deepwood Scouts", 25, 25], ["Eternal Guard", 25, 25], ["Wardancers", 25, 25],
      ["Wildwood Rangers", 25, 25], ["Dryads", 30, 30], ["Tree Kin", 50, 50], ["Glade Riders", 30, 60],
      ["Wild Riders", 30, 60], ["Sisters of the Thorn", 30, 60], ["Warhawk Riders", 50, 50]
    ],
    "Grand Cathay": [
      ["Peasant Long Spearmen", 25, 25], ["Peasant Archers", 25, 25], ["Jade Warriors", 25, 25],
      ["Jade Lancers", 30, 60], ["Celestial Dragon Guard", 25, 25], ["Celestial Dragon Crossbows", 25, 25],
      ["Cathayan Sentinel", 100, 150]
    ],
    "Vampire Counts": [
      ["Skeleton Warriors", 25, 25], ["Zombies", 25, 25], ["Crypt Ghouls", 25, 25], ["Grave Guard", 25, 25],
      ["Black Knights", 30, 60], ["Blood Knights", 30, 60], ["Dire Wolves", 25, 50], ["Fell Bats", 40, 40],
      ["Crypt Horrors", 50, 50], ["Vargheists", 50, 50], ["Spirit Hosts", 50, 50], ["Corpse Cart", 50, 100]
    ],
    "Skaven": [
      ["Clanrats", 25, 25], ["Stormvermin", 25, 25], ["Skavenslaves", 25, 25], ["Night Runners", 25, 25],
      ["Gutter Runners", 25, 25], ["Plague Monks", 25, 25], ["Rat Ogres", 50, 50],
      ["Giant Rats", 25, 50], ["Plague Censer Bearers", 25, 25]
    ],
    "Ogre Kingdoms": [
      ["Ogre Bulls", 40, 40], ["Ironguts", 40, 40], ["Maneaters", 40, 40], ["Leadbelchers", 40, 40],
      ["Gnoblar Fighters", 25, 25], ["Gnoblar Trappers", 25, 25], ["Sabretusks", 25, 50],
      ["Mournfang Cavalry", 50, 100], ["Yhetees", 50, 50], ["Gorgers", 50, 50]
    ],
    "Lizardmen": [
      ["Saurus Warriors", 30, 30], ["Temple Guard", 30, 30], ["Skink Cohorts", 25, 25], ["Skink Skirmishers", 25, 25],
      ["Chameleon Skinks", 25, 25], ["Cold One Riders", 30, 60], ["Kroxigors", 50, 50],
      ["Terradon Riders", 50, 50], ["Ripperdactyl Riders", 50, 50], ["Jungle Swarms", 40, 40]
    ],
    "Dark Elves": [
      ["Dreadspears", 25, 25], ["Bleakswords", 25, 25], ["Darkshards", 25, 25], ["Black Guard of Naggarond", 25, 25],
      ["Har Ganeth Executioners", 25, 25], ["Witch Elves", 25, 25], ["Corsairs", 25, 25],
      ["Dark Riders", 30, 60], ["Cold One Knights", 30, 60], ["Doomfire Warlocks", 30, 60],
      ["Harpies", 25, 25], ["Cold One Chariots", 50, 100]
    ],
    "Daemons of Chaos": [
      ["Bloodletters", 25, 25], ["Daemonettes", 25, 25], ["Plaguebearers", 25, 25], ["Pink Horrors", 25, 25],
      ["Flesh Hounds", 50, 50], ["Seekers of Slaanesh", 30, 60], ["Screamers of Tzeentch", 40, 40],
      ["Nurglings", 40, 40], ["Bloodcrushers", 50, 75], ["Plague Drones", 50, 75]
    ],
    "Chaos Dwarfs": [
      ["Infernal Guard", 25, 25], ["Hobgoblin Cutthroats", 25, 25], ["Hobgoblin Wolf Riders", 25, 50],
      ["Infernal Ironsworn", 25, 25], ["K'daai Fireborn", 50, 50], ["Bull Centaur Renders", 50, 75]
    ]
  };

  const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const aliasesFor = (name, aliases) => [...new Set([
    name,
    name.replace(/\bMobs\b/g, "Mob"),
    name.replace(/\bHerds\b/g, "Herd"),
    name.replace(/\bKnights\b/g, "Knight"),
    name.replace(/\bRiders\b/g, "Rider"),
    name.replace(/\bWarriors\b/g, "Warrior"),
    name.replace(/\bArchers\b/g, "Archer"),
    ...aliases
  ])];
  window.baseCatalogue = Object.entries(armies).flatMap(([army, entries]) => entries.map(([name, width, depth, aliases = []]) => ({
    id: `${slug(army)}-${slug(name)}`,
    army,
    name,
    width,
    depth,
    aliases: aliasesFor(name, aliases).map((alias) => alias.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
  })));
})();
