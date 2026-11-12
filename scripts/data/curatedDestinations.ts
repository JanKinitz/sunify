// Kuratierte Tourismus-Ziele in der DACH-Region.
// Sie ergänzen den GeoNames-Import um einen von Hand gepflegten Tourismus-Score und Tags,
// damit charmante Ausflugsziele (Tegernsee, Cochem, Winterberg …) vor reinen Industrie-
// städten gelistet werden. Koordinaten dienen nur zum Abgleich mit GeoNames (±8 km) bzw.
// als Rückfall, falls ein Ort dort fehlt. Später ersetzbar durch OpenStreetMap-Tourismus-Tags.

export type DestinationTag =
  | "mountains"
  | "hiking"
  | "lake"
  | "coast"
  | "historic"
  | "wine"
  | "culture"
  | "wellness";

export interface CuratedDestination {
  name: string;
  countryCode: "DE" | "AT" | "CH";
  region: string;
  lat: number;
  lon: number;
  population: number;
  score: number;
  tags: DestinationTag[];
}

type Row = [string, "DE" | "AT" | "CH", string, number, number, number, number, string];

// [Name, Land, Bundesland/Kanton, Breite, Länge, Einwohner (ca.), Score, Tags]
const ROWS: Row[] = [
  // --- Deutschland: Süden & Alpenrand ---
  ["Tegernsee", "DE", "Bayern", 47.7123, 11.758, 3700, 92, "lake,mountains,wellness,hiking"],
  ["Garmisch-Partenkirchen", "DE", "Bayern", 47.4917, 11.0955, 27500, 91, "mountains,hiking,wellness"],
  ["Füssen", "DE", "Bayern", 47.5696, 10.7004, 15600, 90, "historic,mountains,lake,hiking"],
  ["Schwangau", "DE", "Bayern", 47.577, 10.737, 3400, 88, "historic,mountains,lake"],
  ["Berchtesgaden", "DE", "Bayern", 47.6303, 13.0019, 7800, 93, "mountains,lake,hiking"],
  ["Oberstdorf", "DE", "Bayern", 47.4099, 10.2797, 9700, 89, "mountains,hiking,wellness"],
  ["Mittenwald", "DE", "Bayern", 47.442, 11.262, 7400, 86, "mountains,hiking"],
  ["Oberammergau", "DE", "Bayern", 47.597, 11.072, 5400, 84, "mountains,culture,hiking"],
  ["Bad Reichenhall", "DE", "Bayern", 47.729, 12.878, 18000, 82, "wellness,mountains"],
  ["Prien am Chiemsee", "DE", "Bayern", 47.856, 12.346, 10700, 85, "lake,culture"],
  ["Schliersee", "DE", "Bayern", 47.736, 11.86, 6900, 84, "lake,mountains,hiking"],
  ["Bad Tölz", "DE", "Bayern", 47.761, 11.558, 19000, 81, "wellness,historic,mountains"],
  ["Kochel am See", "DE", "Bayern", 47.659, 11.369, 4100, 80, "lake,mountains,hiking"],
  ["Bad Hindelang", "DE", "Bayern", 47.506, 10.371, 5200, 83, "mountains,hiking,wellness"],
  ["Oberstaufen", "DE", "Bayern", 47.555, 10.022, 7800, 82, "mountains,wellness,hiking"],
  ["Lindau", "DE", "Bayern", 47.546, 9.6843, 25800, 87, "lake,historic"],
  ["Rothenburg ob der Tauber", "DE", "Bayern", 49.3802, 10.1867, 11400, 89, "historic,culture"],
  ["Dinkelsbühl", "DE", "Bayern", 49.069, 10.32, 12000, 84, "historic,culture"],
  ["Nördlingen", "DE", "Bayern", 48.851, 10.488, 20500, 78, "historic"],
  ["Bamberg", "DE", "Bayern", 49.8988, 10.9028, 78000, 87, "historic,culture"],
  ["Würzburg", "DE", "Bayern", 49.7913, 9.9534, 128000, 84, "wine,historic,culture"],
  ["Volkach", "DE", "Bayern", 49.865, 10.226, 8800, 79, "wine,historic"],
  ["Regensburg", "DE", "Bayern", 49.013, 12.102, 153000, 86, "historic,culture"],
  ["Passau", "DE", "Bayern", 48.574, 13.461, 53000, 83, "historic,culture"],
  ["Bad Kissingen", "DE", "Bayern", 50.2, 10.077, 22500, 80, "wellness,historic"],
  ["Bad Füssing", "DE", "Bayern", 48.353, 13.313, 8000, 76, "wellness"],
  ["Bodenmais", "DE", "Bayern", 49.068, 13.101, 3500, 78, "mountains,hiking"],
  ["München", "DE", "Bayern", 48.1372, 11.5756, 1488000, 84, "culture,historic"],
  ["Nürnberg", "DE", "Bayern", 49.4521, 11.0767, 518000, 80, "historic,culture"],
  // --- Baden-Württemberg ---
  ["Freiburg", "DE", "Baden-Württemberg", 47.999, 7.8421, 236000, 86, "historic,wine,culture"],
  ["Titisee-Neustadt", "DE", "Baden-Württemberg", 47.902, 8.2147, 12300, 84, "lake,hiking,mountains,wellness"],
  ["Baden-Baden", "DE", "Baden-Württemberg", 48.7606, 8.2398, 57000, 85, "wellness,culture,historic"],
  ["Heidelberg", "DE", "Baden-Württemberg", 49.3988, 8.6724, 162000, 90, "historic,culture"],
  ["Meersburg", "DE", "Baden-Württemberg", 47.6942, 9.2706, 6100, 86, "lake,wine,historic"],
  ["Konstanz", "DE", "Baden-Württemberg", 47.678, 9.173, 85000, 85, "lake,historic,culture"],
  ["Überlingen", "DE", "Baden-Württemberg", 47.769, 9.172, 23000, 82, "lake,historic"],
  ["Friedrichshafen", "DE", "Baden-Württemberg", 47.654, 9.479, 62000, 76, "lake,culture"],
  ["Tübingen", "DE", "Baden-Württemberg", 48.521, 9.058, 92000, 83, "historic,culture"],
  ["Triberg", "DE", "Baden-Württemberg", 48.13, 8.233, 4700, 80, "mountains,hiking"],
  ["Baiersbronn", "DE", "Baden-Württemberg", 48.506, 8.371, 15000, 81, "mountains,hiking,wellness"],
  ["Bad Wildbad", "DE", "Baden-Württemberg", 48.757, 8.55, 11000, 77, "wellness,hiking"],
  // --- Rhein, Mosel, Pfalz, Hessen ---
  ["Cochem", "DE", "Rheinland-Pfalz", 50.1467, 7.1667, 5300, 88, "wine,historic,hiking"],
  ["Bernkastel-Kues", "DE", "Rheinland-Pfalz", 49.916, 7.076, 7300, 87, "wine,historic"],
  ["Trier", "DE", "Rheinland-Pfalz", 49.7499, 6.6371, 111000, 82, "historic,wine,culture"],
  ["Boppard", "DE", "Rheinland-Pfalz", 50.231, 7.588, 15500, 80, "wine,historic,hiking"],
  ["Bacharach", "DE", "Rheinland-Pfalz", 50.058, 7.769, 1900, 82, "wine,historic"],
  ["Sankt Goar", "DE", "Rheinland-Pfalz", 50.15, 7.713, 2800, 80, "wine,historic,hiking"],
  ["Bad Neuenahr-Ahrweiler", "DE", "Rheinland-Pfalz", 50.544, 7.113, 28000, 79, "wine,wellness,historic"],
  ["Speyer", "DE", "Rheinland-Pfalz", 49.317, 8.431, 51000, 81, "historic,culture"],
  ["Neustadt an der Weinstraße", "DE", "Rheinland-Pfalz", 49.35, 8.139, 53000, 80, "wine,historic"],
  ["Bad Dürkheim", "DE", "Rheinland-Pfalz", 49.462, 8.172, 18500, 79, "wine,wellness"],
  ["Deidesheim", "DE", "Rheinland-Pfalz", 49.408, 8.186, 3700, 81, "wine,historic"],
  ["Rüdesheim am Rhein", "DE", "Hessen", 49.979, 7.9234, 10000, 85, "wine,historic,hiking"],
  ["Marburg", "DE", "Hessen", 50.81, 8.771, 77000, 79, "historic,culture"],
  // --- Westen & Mitte ---
  ["Winterberg", "DE", "Nordrhein-Westfalen", 51.195, 8.5347, 12600, 78, "mountains,hiking"],
  ["Monschau", "DE", "Nordrhein-Westfalen", 50.555, 6.24, 11700, 84, "historic,hiking"],
  ["Münster", "DE", "Nordrhein-Westfalen", 51.962, 7.626, 317000, 80, "historic,culture"],
  ["Goslar", "DE", "Niedersachsen", 51.906, 10.429, 50000, 82, "historic,hiking,mountains"],
  ["Bad Harzburg", "DE", "Niedersachsen", 51.881, 10.562, 22000, 77, "wellness,hiking,mountains"],
  ["Celle", "DE", "Niedersachsen", 52.624, 10.081, 69000, 78, "historic,culture"],
  ["Lüneburg", "DE", "Niedersachsen", 53.25, 10.414, 77000, 81, "historic,culture"],
  ["Wernigerode", "DE", "Sachsen-Anhalt", 51.835, 10.785, 32000, 84, "historic,hiking,mountains"],
  ["Quedlinburg", "DE", "Sachsen-Anhalt", 51.789, 11.1414, 23500, 83, "historic,culture,hiking"],
  ["Weimar", "DE", "Thüringen", 50.98, 11.329, 65000, 84, "culture,historic"],
  ["Erfurt", "DE", "Thüringen", 50.978, 11.029, 214000, 81, "historic,culture"],
  ["Eisenach", "DE", "Thüringen", 50.975, 10.32, 42000, 80, "historic,culture,hiking"],
  // --- Osten ---
  ["Dresden", "DE", "Sachsen", 51.0504, 13.7373, 556000, 86, "culture,historic"],
  ["Meißen", "DE", "Sachsen", 51.163, 13.474, 28000, 79, "historic,wine,culture"],
  ["Görlitz", "DE", "Sachsen", 51.153, 14.988, 56000, 81, "historic,culture"],
  ["Bad Schandau", "DE", "Sachsen", 50.9177, 14.1547, 3600, 86, "mountains,hiking,wellness"],
  ["Potsdam", "DE", "Brandenburg", 52.396, 13.058, 183000, 85, "historic,culture,lake"],
  ["Berlin", "DE", "Berlin", 52.52, 13.405, 3645000, 82, "culture,historic"],
  // --- Norden & Küste ---
  ["Lübeck", "DE", "Schleswig-Holstein", 53.866, 10.687, 217000, 84, "historic,culture,coast"],
  ["Timmendorfer Strand", "DE", "Schleswig-Holstein", 53.995, 10.782, 9000, 81, "coast,wellness"],
  ["Westerland", "DE", "Schleswig-Holstein", 54.908, 8.308, 9000, 88, "coast,wellness"],
  ["Sankt Peter-Ording", "DE", "Schleswig-Holstein", 54.305, 8.65, 4000, 85, "coast,wellness"],
  ["Hamburg", "DE", "Hamburg", 53.5511, 9.9937, 1841000, 83, "culture,historic"],
  ["Cuxhaven", "DE", "Niedersachsen", 53.861, 8.694, 48000, 78, "coast"],
  ["Norderney", "DE", "Niedersachsen", 53.707, 7.147, 6000, 84, "coast,wellness"],
  ["Stralsund", "DE", "Mecklenburg-Vorpommern", 54.309, 13.082, 59000, 82, "historic,coast,culture"],
  ["Binz", "DE", "Mecklenburg-Vorpommern", 54.4, 13.61, 5200, 87, "coast,wellness"],
  ["Kühlungsborn", "DE", "Mecklenburg-Vorpommern", 54.151, 11.745, 8000, 83, "coast,wellness"],
  ["Heringsdorf", "DE", "Mecklenburg-Vorpommern", 53.955, 14.168, 8500, 84, "coast,wellness"],
  ["Waren", "DE", "Mecklenburg-Vorpommern", 53.52, 12.68, 21000, 80, "lake,hiking"],
  // --- Österreich ---
  ["Salzburg", "AT", "Salzburg", 47.8095, 13.055, 157000, 93, "historic,culture"],
  ["Zell am See", "AT", "Salzburg", 47.323, 12.797, 10000, 89, "lake,mountains,hiking"],
  ["Bad Gastein", "AT", "Salzburg", 47.115, 13.135, 4000, 83, "wellness,mountains"],
  ["Innsbruck", "AT", "Tirol", 47.2692, 11.4041, 131000, 88, "mountains,historic,culture,hiking"],
  ["Kitzbühel", "AT", "Tirol", 47.447, 12.392, 8300, 88, "mountains,hiking,wellness"],
  ["Mayrhofen", "AT", "Tirol", 47.167, 11.865, 3900, 84, "mountains,hiking"],
  ["Seefeld in Tirol", "AT", "Tirol", 47.33, 11.188, 3400, 85, "mountains,hiking,wellness"],
  ["Sölden", "AT", "Tirol", 46.966, 11.007, 3100, 82, "mountains,hiking"],
  ["Sankt Anton am Arlberg", "AT", "Tirol", 47.129, 10.268, 2400, 83, "mountains,hiking"],
  ["Lech", "AT", "Vorarlberg", 47.208, 10.142, 1600, 84, "mountains,hiking"],
  ["Bregenz", "AT", "Vorarlberg", 47.5031, 9.7471, 29000, 83, "lake,culture"],
  ["Hallstatt", "AT", "Oberösterreich", 47.5622, 13.6493, 750, 94, "lake,historic,mountains"],
  ["Bad Ischl", "AT", "Oberösterreich", 47.711, 13.624, 14000, 84, "wellness,historic,mountains"],
  ["Gmunden", "AT", "Oberösterreich", 47.918, 13.799, 13000, 82, "lake,historic"],
  ["Sankt Wolfgang im Salzkammergut", "AT", "Oberösterreich", 47.739, 13.447, 2800, 87, "lake,mountains,historic"],
  ["Schladming", "AT", "Steiermark", 47.393, 13.687, 6700, 82, "mountains,hiking"],
  ["Graz", "AT", "Steiermark", 47.071, 15.438, 290000, 82, "historic,culture"],
  ["Velden am Wörther See", "AT", "Kärnten", 46.613, 14.042, 9000, 84, "lake,wellness"],
  ["Dürnstein", "AT", "Niederösterreich", 48.395, 15.52, 900, 85, "wine,historic"],
  ["Krems an der Donau", "AT", "Niederösterreich", 48.409, 15.614, 25000, 80, "wine,historic,culture"],
  ["Melk", "AT", "Niederösterreich", 48.227, 15.332, 5500, 81, "historic,culture"],
  ["Wien", "AT", "Wien", 48.2082, 16.3738, 1900000, 90, "culture,historic,wine"],
  // --- Schweiz ---
  ["Luzern", "CH", "Luzern", 47.0502, 8.3093, 83000, 92, "lake,historic,mountains,culture"],
  ["Lugano", "CH", "Tessin", 46.0037, 8.9511, 63000, 90, "lake,culture,hiking"],
  ["Locarno", "CH", "Tessin", 46.171, 8.799, 16000, 87, "lake,culture"],
  ["Ascona", "CH", "Tessin", 46.157, 8.773, 5500, 88, "lake,culture"],
  ["Interlaken", "CH", "Bern", 46.686, 7.863, 5700, 91, "lake,mountains,hiking"],
  ["Grindelwald", "CH", "Bern", 46.624, 8.041, 3800, 92, "mountains,hiking"],
  ["Lauterbrunnen", "CH", "Bern", 46.593, 7.908, 2400, 90, "mountains,hiking"],
  ["Thun", "CH", "Bern", 46.758, 7.628, 43000, 84, "lake,historic"],
  ["Bern", "CH", "Bern", 46.948, 7.4474, 134000, 86, "historic,culture"],
  ["Zermatt", "CH", "Wallis", 46.02, 7.749, 5800, 94, "mountains,hiking"],
  ["Sankt Moritz", "CH", "Graubünden", 46.497, 9.838, 5000, 90, "mountains,lake,wellness"],
  ["Davos", "CH", "Graubünden", 46.803, 9.836, 10900, 86, "mountains,hiking"],
  ["Arosa", "CH", "Graubünden", 46.778, 9.673, 3200, 85, "mountains,hiking"],
  ["Engelberg", "CH", "Obwalden", 46.821, 8.401, 4300, 86, "mountains,hiking"],
  ["Appenzell", "CH", "Appenzell Innerrhoden", 47.331, 9.409, 5800, 84, "mountains,hiking,historic"],
  ["Stein am Rhein", "CH", "Schaffhausen", 47.659, 8.859, 3400, 84, "historic"],
  ["Montreux", "CH", "Waadt", 46.433, 6.911, 26000, 87, "lake,culture,wine"],
  ["Lausanne", "CH", "Waadt", 46.52, 6.633, 140000, 82, "lake,culture"],
  ["Zürich", "CH", "Zürich", 47.3769, 8.5417, 420000, 84, "culture,lake,historic"],
];

export const CURATED_DESTINATIONS: CuratedDestination[] = ROWS.map(
  ([name, countryCode, region, lat, lon, population, score, tags]) => ({
    name,
    countryCode,
    region,
    lat,
    lon,
    population,
    score,
    tags: tags.split(",") as DestinationTag[],
  })
);
