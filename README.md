# Llanto de Isaac 🍼

Prototipo de **roguelike 2D** inspirado en *The Binding of Isaac*, hecho con **HTML, CSS y JavaScript puro** (sin frameworks ni paso de compilación). Se puede jugar **en solitario**, en **cooperativo local** (2 jugadores en el mismo teclado) o **online en salas de 1 a 4 jugadores**.

El objetivo es sencillo: baja los **9 pisos** del calabozo, derrota al **jefe** de cada piso y pisa la trampilla para descender. Cada piso es más grande, tiene más enemigos y un jefe con su propio patrón. Si todos los jugadores caen, se acaba la partida.

---

## 🎮 Controles

| Acción | Jugador 1 | Jugador 2 (coop local) |
| --- | --- | --- |
| Moverse | `W` `A` `S` `D` | `I` `J` `K` `L` |
| Disparar | Flechas `↑` `←` `↓` `→` | `T` `F` `G` `H` |
| Pausa | `Esc` | `Esc` |
| Silenciar | `M` | `M` |

- Moverse en una dirección y disparar en otra es totalmente compatible (8 direcciones de disparo).
- En modo online cada jugador usa **su propio teclado**: se mueve con `WASD` y dispara con las flechas.

---

## ▶️ Cómo jugar

Antes de empezar, escribe tu **nombre** y elige tu **personaje (skin)** en el menú. El nombre aparece también en la pantalla *Unirse a una sala*. Tanto el nombre como la skin se recuerdan en el navegador y se usan en todos los modos: en solitario, cooperativo local y online (los demás jugadores ven tu skin).

### En solitario
1. Abre el juego.
2. Pulsa **Jugar solo**.

### Cooperativo local (2 jugadores, un teclado)
1. Pulsa **Cooperativo local (2p)**.

### Online (1 a 4 jugadores)
1. **Anfitrión**: pulsa **Crear sala online**. Aparecerá un **código de 4 caracteres**; compártelo (botones *Copiar código* / *Copiar enlace*).
2. **Los demás**: pulsen **Unirse a una sala**, escriban el código y su nombre, y pulsen **Conectar**.
3. Cuando todos estén en la sala de espera, el anfitrión pulsa **Comenzar partida**.

> También puedes entrar directo con un enlace del tipo `https://tu-usuario.github.io/tu-repo/?sala=ABCD`.

---

## 🌐 Cómo funciona el multijugador

No hay servidor propio: la partida se juega **Peer-to-Peer (WebRTC)** usando el **bróker público de PeerJS** (`https://unpkg.com/peerjs@1.5.4/`). Ese bróker solo sirve para que los jugadores se encuentren; los datos viajan directamente entre navegadores.

- **El anfitrión es autoritativo**: es quien simula la partida (enemigos, balas, colisiones, objetos) y difunde **instantáneas completas del estado a 20 Hz**.
- **Los clientes** envían su entrada (movimiento y disparo) a 30 Hz, interpolan el estado recibido (~130 ms de retardo) y **predicen** localmente su propio jugador para que se sienta fluido.
- El calabozo se genera de forma **determinista** a partir de una semilla; el anfitrión la envía al empezar y en cada instantánea, así que todas las pantallas ven exactamente el mismo mapa.
- **Se puede entrar con la partida en marcha**: al conectarse, el cliente recibe el estado actual y se incorpora.
- La sala admite **4 jugadores** como máximo; a partir de ahí se avisa de que está llena.

**Consejos si falla la conexión:** algunas redes (WiFi corporativas, datos con NAT estricto) bloquean las conexiones P2P. Prueba otro WiFi o datos móviles. Si el navegador no puede cargar PeerJS, el multijugador se desactiva con un aviso, pero **el juego en solitario sigue funcionando**.

---

## 🕹️ Cómo se juega (reglas)

- Cada habitación se **cierra** hasta que derrotas a todos los enemigos; entonces se abren las puertas.
- **Gracia al entrar**: al cruzar una puerta, los jugadores son invulnerables unos instantes y los enemigos aparecen con un breve margen (y nunca pegados a la puerta por la que entras), para que no te hagan daño nada más aparecer.
- El **minimapa** (arriba a la derecha) muestra las salas visitadas, las puertas y el tipo de habitación. Las salas contiguas aún **sin explorar** se marcan con **«?»** y *no se vuelven a ocultar* al moverte a otra habitación.
- Tipos de sala: **inicio**, **normal**, **tesoro**, **tienda** (los objetos se compran con monedas) y **jefe**. Cuanto más bajas, más salas por piso (hasta 22).
- Algunas salas opcionales (**tesoro** siempre, **tienda** a partir del piso 2) tienen la puerta con **candado dorado**: hace falta una **llave 🔑** para abrirla. El camino al jefe nunca se cierra.
- Enemigos: `fly` (mosca), `gaper`, `charger` (embiste), `spitter` (escupe), `hopper` (salta), `fat` (gordo, se divide) y **8 jefes** distintos, uno por piso, cada uno con patrón y estadísticas propias (ráfagas, embestidas, espirales, teletransporte, saltos, plumas, calaveras y aparición de esbirros).
- Recoge **corazones** (rojo = 1 de vida, medio = medio corazón), **monedas**, **llaves** y objetos de los pedestales.
- Hay **unos 50 objetos** repartidos en **4 niveles de rareza**: común, poco común, raro y épico (los raros salen mucho menos). Unos afectan a daño, cadencia, velocidad, proyectil extra, balas perforantes/rebotantes/teledirigidas, armadura, regeneración, escudo, vidas extra, robo de vida… y a la **Brújula** y el **Mapa del piso**.
- Otros dan **habilidades únicas**: fuego, veneno, hielo, explosiones, rayos en cadena, bumerán, **moscas familiares** que orbitan, imán de monedas, golpe cargado, espinas que devuelven daño, ráfaga doble, codicia y empuje.
- Las habilidades **sinergizan** entre sí (12 combinaciones): fuego + veneno = «Nube tóxica ardiente», explosión + rebotes = «Metralla», hielo + perforante = «Escarcha cortante», cadena + teledirigido = «Tormenta dirigida», y más. El globo anticipa las sinergias con **⚡ Sinergia** antes de coger el objeto.
- Los objetos se reparten por **zonas**: la **sala del tesoro**, la **tienda** (con precio) y la **recompensa del jefe** (algunos salen en varias). Además hay **10 skins** de personaje con accesorios propios.
- Al acercarte a un pedestal aparece un **globo** con el nombre, la rareza y lo que suma o resta el objeto (y el precio, si es de la tienda).
- Derrota al jefe, baja por la **trampilla** y repite en los pisos 2 a 9. Al superar el piso 9, **¡victoria!**

### Música y sonido

- La banda sonora es **procedural** (WebAudio, sin archivos): una pista para el **menú**, otra para las **salas** y otra para el **jefe**, que cambia automáticamente según dónde estés. Ahora suenan con **batería** (bombo, caja y hi-hat), **bajo y acordes de potencia con distorsión** y tempos rápidos.
- Pulsa `M` (o el botón 🔊 de la barra superior) para **silenciar** efectos y música.

---

## 🚀 Publicar en GitHub Pages

El juego es 100 % estático, así que se despliega copiando los archivos a un repositorio.

1. **Crea el repositorio** en GitHub y sube el proyecto (`index.html`, `css/`, `js/` y este `README.md`).
   ```bash
   git init
   git add .
   git commit -m "Llanto de Isaac: prototipo inicial"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
2. **Activa Pages**: en el repositorio ve a **Settings → Pages**.
   - *Source*: **Deploy from a branch**.
   - *Branch*: **main** y carpeta **/ (root)**.
   - Guarda.
3. En un par de minutos estará disponible en:
   ```
   https://TU-USUARIO.github.io/TU-REPO/
   ```

El archivo `.nojekyll` ya está incluido para que GitHub Pages no procese los directorios con Jekyll (evita que se ignoren archivos que empiecen por `_`).

> **Importante:** el multijugador online necesita **HTTPS** (o `localhost`) para que el navegador permita WebRTC. GitHub Pages ya sirve por HTTPS.

### Probar en local

Puedes abrir `index.html` directamente, pero para el modo online es mejor servirlo por HTTP:

```bash
# Python 3
python3 -m http.server 8000
# Luego abre http://localhost:8000
```

---

## 🧱 Estructura del proyecto

```
.
├── index.html          # Estructura de la página y todos los overlays (menú, lobby, pausa…)
├── css/
│   └── style.css       # Estilos de la interfaz, menús y overlays
├── js/
│   ├── utils.js        # Constantes, PRNG (mulberry32), matemáticas y utilidades
│   ├── audio.js        # Efectos de sonido procedurales con WebAudio
│   ├── input.js        # Teclado: movimiento y disparo por esquema de control
│   ├── entities.js     # Fábricas y tablas de jugadores, enemigos, balas y objetos
│   ├── dungeon.js      # Generación determinista de pisos y plan de enemigos
│   ├── render.js       # Renderizado en Canvas 2D y HUD (corazones, minimapa, avisos)
│   ├── net.js          # Capa de red sobre PeerJS (anfitrión/cliente, envío, difusión)
│   ├── game.js         # Simulación, reglas, serialización de estado e interpolación
│   └── main.js         # Interfaz, menús, bucle principal y protocolo de red
└── .nojekyll           # Evita el procesado de Jekyll en GitHub Pages
```

Se usan etiquetas `<script>` clásicas (sin módulos ES) para que el juego también funcione abriendo el archivo directamente desde el disco. No hace falta instalar nada ni compilar.

---

## 🧪 Salud del proyecto

- La simulación y el renderizado están verificados con un conjunto de pruebas sin navegador (Node): generación de calabozo determinista, transiciones de puerta, progresión completa (pisos → jefe → trampilla → victoria), objetos y rarezas, **habilidades únicas y sinergias** (fuego/veneno con daño con el tiempo, explosión en área, rayo en cadena, moscas familiares, imán, espinas, codicia, bumerán, empuje, serialización del estado de los enemigos y globo con sinergias), cerraduras con llave, patrones de jefe, globo de objetos, ausencia de excepciones y una prueba de integración de la interfaz.
- El protocolo de red (anfitrión y cliente) también está cubierto con un PeerJS simulado: *hello/welcome*, lobby, *start*, instantáneas de estado, `ping/pong`, jugador que entra/sale, sala llena y fin de partida.

---

## 📝 Notas

- Proyecto **educativo/prototipo**: no está afiliado a *The Binding of Isaac* ni a sus creadores.
- Todo el arte se dibuja por código sobre el `<canvas>` y el sonido se sintetiza con WebAudio, así que no hay recursos binarios externos.
