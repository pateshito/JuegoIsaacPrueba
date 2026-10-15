# Llanto de Isaac 🍼

Prototipo de **roguelike 2D** inspirado en *The Binding of Isaac*, hecho con **HTML, CSS y JavaScript puro** (sin frameworks ni paso de compilación). Se puede jugar **en solitario**, en **cooperativo local** (2 jugadores en el mismo teclado) o **online en salas de 1 a 4 jugadores**.

El objetivo es sencillo: baja los **9 pisos** del calabozo, derrota al **jefe** de cada piso y pisa la trampilla para descender. **Cada piso tiene su propio diseño**, y es más grande y peligroso que el anterior. Si todos los jugadores caen, se acaba la partida. Entre partidas acumulas **progreso** para **desbloquear personajes** con habilidades propias.

---

## 🎮 Controles

| Acción | Jugador 1 | Jugador 2 (coop local) |
| --- | --- | --- |
| Moverse | `W` `A` `S` `D` | `I` `J` `K` `L` |
| Disparar | Flechas `↑` `←` `↓` `→` | `T` `F` `G` `H` |
| Habilidad activa | `Espacio` | `Y` |
| Ver mejoras (mantener) | `Tab` | `Tab` |
| Pausa | `Esc` | `Esc` |
| Silenciar | `M` | `M` |

- Moverse en una dirección y disparar en otra es totalmente compatible (8 direcciones de disparo).
- En modo online cada jugador usa **su propio teclado**: se mueve con `WASD`, dispara con las flechas y usa su **habilidad** con `Espacio`.

---

## ▶️ Cómo jugar

Antes de empezar, escribe tu **nombre** y elige tu **personaje** en el menú (cada uno tiene estadísticas propias, una **pasiva** permanente y una **habilidad activa**). El nombre aparece también en la pantalla *Unirse a una sala*. El nombre y el personaje se recuerdan en el navegador y se usan en todos los modos: en solitario, cooperativo local y online (los demás jugadores ven tu personaje).

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
- **Cada piso tiene su propio diseño**: cambian los colores, el tipo de obstáculos y la densidad, **y también los enemigos que lo pueblan** (los duros solo aparecen en los pisos avanzados; cada piso tiñe a sus enemigos con su color). Además, **cada sala elige un diseño distinto** dentro de su piso (rejilla, columnas, esquinas, cruz, anillo, racimos, arena, disperso…), así que dos habitaciones del mismo piso no se ven iguales. `Sótano`, `Cuevas`, `Catacumbas`, `Vientre`, `Desierto`, `Criohielo`, `Infierno`, `Vacío` y `Cielo`.
- Algunas salas opcionales (**tesoro** siempre, **tienda** a partir del piso 2) tienen la puerta con **candado dorado**: hace falta una **llave 🔑** para abrirla. El camino al jefe nunca se cierra.
- **Al despejar una sala** ya no cae botín de los enemigos: la recompensa (monedas, y a veces corazón o llave) aparece en el centro al terminar. Con cierta probabilidad aparece también un **cofre**:
  - **Cofre gratis** 🎁: suelta monedas y, a veces, un corazón o una llave.
  - **Cofre cerrado** 🔒 (cuesta 1 llave): garantiza un **objeto** para todo el equipo más algunas monedas. La sala del **tesoro** siempre trae además un cofre gratis.
- **Sellado al aparecer**: lo que acaba de generarse (botín al despejar, cofres) no se puede coger durante un instante (~1 s). La **recompensa del jefe** (objeto, llave y trampilla) sale **sellada 2 s** con un **contador visible** encima antes de poder recogerla o bajar de piso.
- Enemigos: `fly` (mosca), `gaper`, `charger` (embiste), `spitter` (escupe), `hopper` (salta), `fat` (gordo, se divide), **`ghost`** (espectro que **atraviesa obstáculos**) y **`sniper`** (francotirador que dispara de lejos), más **8 jefes** distintos, cada uno con patrón y estadísticas propias (ráfagas, embestidas, espirales, teletransporte, saltos, plumas, calaveras y aparición de esbirros). **Cada piso sortea su jefe entre al menos 3 posibles** (solo aparece uno) y la **vida y dificultad de los jefes suben piso a piso**. La IA es más viva: los enemigos **anticipan tu movimiento** al perseguir y disparar, los que disparan **mantienen la distancia y serpentean**, y los cargadores **avisan antes de embestir** y quedan vulnerables un instante si fallan.
- **Botín de equipo**: recoge **corazones** (al curarte, curas a **todos**), **monedas** y **llaves** (compartidas por el grupo) y objetos de los pedestales.
- **Curaciones y resistencias más modestas**: los corazones curan menos, las regeneraciones son lentas, el robo de vida se acumula (medio corazón cada dos bajas) y la armadura está topada (como mucho 2 puntos). También hay **un dibujo distinto para cada uno de los ~50 objetos**.
- Hay **unos 50 objetos** repartidos en **5 niveles de rareza**: común, poco común, raro, épico y **legendario** (rarísimo). Unos afectan a daño, cadencia, velocidad, proyectil extra, balas perforantes/rebotantes/teledirigidas, armadura, regeneración, escudo, vidas extra, robo de vida… y a la **Brújula** y el **Mapa del piso**.
- **Los objetos son del equipo**: en cuanto uno los coge, los comparten todos los jugadores. Con la tecla **`Tab`** (mantener) ves un panel con todas las mejoras; pasa el ratón por encima para leer qué hacen y cómo se combinan (esto solo lo ve quien pulsa la tecla).
- Otros objetos dan **habilidades únicas**: fuego, veneno, hielo, explosiones, rayos en cadena, bumerán, **moscas familiares** que orbitan, imán de monedas, golpe cargado, espinas que devuelven daño, ráfaga doble, codicia y empuje.
- Las habilidades **sinergizan** entre sí (12 combinaciones): fuego + veneno = «Nube tóxica ardiente», explosión + rebotes = «Metralla», hielo + perforante = «Escarcha cortante», cadena + teledirigido = «Tormenta dirigida», y más. El globo anticipa las sinergias con **⚡ Sinergia** antes de coger el objeto.
- Al acercarte a un pedestal aparece un **globo** con el nombre, la rareza y lo que suma o resta el objeto (y el precio, si es de la tienda).
- **Personajes**: hay **14 personajes** con estadísticas distintas, una **pasiva** siempre activa y una **habilidad activa** con **cargas**. Al limpiar una sala se **reduce 15 s** el enfriamiento de la habilidad. Pulsa `Espacio` (o `Y` en coop local) para usarla. (Por ejemplo, **Magdalena** ya no regenera: tiene un **15% de curarse un corazón al limpiar** una sala.)
- **Reanimaciones**: en cooperativo **cada jugador se reanima una vez por piso**; en solitario tienes una reanimación y después caes. Los objetos **Vida extra** y **Pluma de fénix** suman **+1 reanimación por piso** (la pluma solo aparece en la tienda).
- Derrota al jefe, baja por la **trampilla** y repite en los pisos 2 a 9. Al superar el piso 9, **¡victoria!**

### Progreso permanente (meta)

Además de la partida, ganas **monedas de progreso** según lo lejos que llegues (y un buen extra si ganas). Con ellas desbloqueas **personajes nuevos** en la **Tienda**, salvo algunos que antes exigen cumplir un reto (llegar al piso 5, derrotar 3 jefes, conseguir 8 logros…). Ciertos **sucesos muy raros** que aparecen en las salas otorgan monedas y desbloquean la compra de un personaje secreto.

- Los **logros** (12) se conceden una sola vez y aparecen como **avisos abajo a la izquierda**.
- Todo se guarda en el navegador (**localStorage**). Desde **Progreso y logros** puedes **borrar solo los logros** o **borrar TODO el progreso**.

### Sonido

- Los **efectos de sonido** son **procedurales** (WebAudio, sin archivos): disparos, impactos, bajas, daño, recogidas (corazones, monedas, objetos), puertas, cerraduras, fin de sala, explosiones, avisos de jefe, victoria/derrota y avisos de la interfaz. No hay música.
- Pulsa `M` (o el botón 🔊 de la barra superior) para **silenciar** los efectos.

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
│   ├── audio.js        # Efectos de sonido procedurales (WebAudio)
│   ├── characters.js   # Personajes: estadísticas, pasiva y habilidad activa
│   ├── meta.js         # Progreso persistente: monedas, personajes, logros (localStorage)
│   ├── input.js        # Teclado: movimiento, disparo y habilidad por esquema de control
│   ├── entities.js     # Fábricas y tablas de jugadores, enemigos, balas y objetos
│   ├── dungeon.js      # Generación determinista de pisos, temas y plan de enemigos
│   ├── render.js       # Renderizado en Canvas 2D y HUD (corazones, minimapa, habilidad)
│   ├── net.js          # Capa de red sobre PeerJS (anfitrión/cliente, envío, difusión)
│   ├── game.js         # Simulación, reglas, serialización de estado e interpolación
│   └── main.js         # Interfaz, menús (tienda/progreso), bucle principal y red
└── .nojekyll           # Evita el procesado de Jekyll en GitHub Pages
```

Se usan etiquetas `<script>` clásicas (sin módulos ES) para que el juego también funcione abriendo el archivo directamente desde el disco. No hace falta instalar nada ni compilar.

---

## 🧪 Salud del proyecto

- La simulación y el renderizado están verificados con un conjunto de pruebas sin navegador (Node): generación de calabozo determinista, **variedad de diseños de sala**, transiciones de puerta y **temas por piso**, progresión completa (pisos → jefe → trampilla → victoria), objetos y rarezas, **habilidades únicas y sinergias** (fuego/veneno con daño con el tiempo, explosión en área, rayo en cadena, moscas familiares, imán, espinas, codicia, bumerán, empuje, serialización del estado de los enemigos y globo con sinergias), **recompensa al despejar salas y cofres (gratis y con llave)**, **nueva IA y enemigos (espectro, francotirador)**, cerraduras con llave, patrones de jefe, globo de objetos, ausencia de excepciones y una prueba de integración de la interfaz.
- También se prueban el **equilibrio y el contenido nuevos**: el **sellado al aparecer** (botín ~1 s y recompensa de jefe 2 s con contador), las **bolsas de jefes por piso** (≥3 candidatos, uno al azar y determinista), la **progresión de dificultad de los jefes**, los **enemigos propios de cada piso** y la **pasiva nueva de Magdalena**.
- También se prueban los **personajes** (activa, pasiva y estadísticas), el **progreso persistente** (monedas, compra y requisitos, logros y avisos, borrado selectivo y total, persistencia), los **objetos compartidos**, las **reanimaciones** y el **panel de mejoras**.
- El protocolo de red (anfitrión y cliente) también está cubierto con un PeerJS simulado: *hello/welcome*, lobby, *start*, instantáneas de estado, `ping/pong`, jugador que entra/sale, sala llena y fin de partida.

---

## 📝 Notas

- Proyecto **educativo/prototipo**: no está afiliado a *The Binding of Isaac* ni a sus creadores.
- Todo el arte se dibuja por código sobre el `<canvas>` y el sonido se sintetiza con WebAudio, así que no hay recursos binarios externos.
