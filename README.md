# 🎮 RogueLikeArena 2D

**¡Juega ahora directamente en tu navegador!**  
🔗 [https://pateshito.github.io/JueguitoRoguelike/](https://pateshito.github.io/JueguitoRoguelike/)

**Un roguelike 2D de acción, cooperativo online y generación procedural.**  
*Hecho 100% con HTML, CSS y JavaScript puro (sin frameworks, sin motores, sin archivos binarios).*

Desciende a través de 9 pisos generados proceduralmente, derrota a jefes con patrones únicos, recolecta objetos que combinan entre sí (sinergias) y desbloquea personajes con habilidades propias. ¡Juega solo o únete a una sala online con hasta 3 amigos!

---

## ✨ Características Principales

- 🗺️ **Generación Procedural:** 9 pisos con temas visuales, diseños de sala y enemigos completamente distintos.
- 👥 **Multijugador P2P:** Cooperativo online de 1 a 4 jugadores mediante WebRTC (sin servidor propio).
- 🦸 **14 Personajes Únicos:** Cada uno con estadísticas base, una pasiva permanente y una habilidad activa que se recarga eliminando enemigos.
- 👹 **8 Jefes Épicos:** Patrones de ataque telegrafiados (¡ninguno ataca por sorpresa!), fases de ira y esbirros del piso.
- 💎 **Sistema de Sinergias:** Más de 50 objetos con 12 combinaciones sinérgicas devastadoras (ej. *Fuego + Veneno = Nube tóxica ardiente*).
- 🏆 **Progreso Persistente:** Desbloquea personajes cumpliendo retos, superando desafíos o consiguiendo logros (guardado en `localStorage`).
- 🧪 **Zona de Pruebas:** Sala aislada con un muñeco de práctica para testear el daño y las habilidades de cualquier personaje.

---

## 🕹️ Controles

| Acción | Jugador 1 (Teclado) |
| :--- | :--- |
| **Moverse** | `W` `A` `S` `D` |
| **Disparar** | `↑` `←` `↓` `→` |
| **Habilidad Activa** | `Espacio` |
| **Ver Mejoras** | `Tab` (mantener) |
| **Pausa** | `Esc` |
| **Silenciar** | `M` |
| **Mostrar Hitboxes** | `H` |

> 💡 *Puedes moverte y disparar en direcciones simultáneamente (8 direcciones de disparo).*

---

## 📖 Cómo se Juega

1. **Explora y Limpia:** Entra en las habitaciones y derrota a todos los enemigos para abrir las puertas.
2. **Recompensas:** Al limpiar una sala, aparece botín (monedas, corazones, llaves). A veces surgen **cofres** (normales o dorados ✨) que contienen objetos poderosos.
3. **Objetos Compartidos:** En cooperativo, los objetos de los pedestales son del equipo. ¡Los jugadores caídos no reciben objetos hasta que revivan!
4. **Puertas Cerradas:** Las salas de *Tesoro* y *Tienda* requieren una **llave 🔑** para abrirse. El camino al jefe siempre está despejado.
5. **Jefes Telegrafiados:** Los jefes avisan sus ataques con indicadores visuales (líneas, aros, abanicos). ¡Observa y esquiva!
6. **Habilidades Activas:** No se recargan con el tiempo ni al limpiar salas. **Solo se recargan eliminando enemigos.** Pulsa `Espacio` para desatarlas.

---

## 🌐 Multijugador Online (P2P)

- Cada habitación se **cierra** hasta que derrotas a todos los enemigos; entonces se abren las puertas.
- **Gracia al entrar**: al cruzar una puerta, los jugadores son invulnerables unos instantes y los enemigos aparecen con un breve margen (y nunca pegados a la puerta por la que entras), para que no te hagan daño nada más aparecer.
- El **minimapa** (arriba a la derecha) muestra las salas visitadas, las puertas y el tipo de habitación. Las salas contiguas aún **sin explorar** se marcan con **«?»** y *no se vuelven a ocultar* al moverte a otra habitación.
- Tipos de sala: **inicio**, **normal**, **tesoro**, **tienda** (los objetos se compran con monedas) y **jefe**. Cuanto más bajas, más salas por piso (hasta 22). La **puerta que lleva a la sala del jefe** tiene su **propio marco** (filo rojo, pinchos y una calavera, marcado en las dos caras del vano) para reconocerla de un vistazo. Las puertas con llave de la **tienda** y del **tesoro** también tienen **marcos propios y distintos entre sí** (la tienda, **verde con una moneda**; el tesoro, **dorado con una gema**), marcados en las dos caras del vano.
- **Hitboxes visibles**: tu personaje usa una **hitbox mucho más pequeña que su dibujo** (radio 6) **sobre su torso** para que esquivar sea justo. Con la tecla **`H`** activas o desactivas estas marcas: cuando están activadas, si un **enemigo o proyectil** entra en tu radio cercano (unos 155 px) se dibuja su **caja de colisión** luminosa (roja para jefes, naranja para enemigos y del color de la bala para proyectiles); la tuya es un **circulito relleno** luminoso sobre el torso.
- **Cada piso tiene su propio diseño**: cambian los colores, el tipo de obstáculos y la densidad, **y también los enemigos que lo pueblan** (los duros solo aparecen en los pisos avanzados; **ningún piso repite los tipos de enemigo del piso anterior**; cada piso tiñe a sus enemigos con su color). **Suelo y muros tienen decoración propia por piso** (losas del sótano, roca y piedras de las cuevas, criptas con calaveras, carne y venas del vientre, ondulaciones de arena, grietas de hielo, grietas de lava, vacío estrellado y nubes del cielo), con **antorchas o cristales** según el tema. La **sala del jefe** usa **esbirros del propio piso**. Además, **cada sala elige un diseño distinto** dentro de su piso (rejilla, columnas, esquinas, cruz, anillo, racimos, arena, disperso…), así que dos habitaciones del mismo piso no se ven iguales. `Sótano`, `Cuevas`, `Catacumbas`, `Vientre`, `Desierto`, `Criohielo`, `Infierno`, `Vacío` y `Cielo`.
- Las salas opcionales (**tesoro** y **tienda**) tienen la puerta **cerrada con llave 🔑**: hace falta una **llave** para abrirlas. El camino al jefe nunca se cierra.
- **Al despejar una sala** el botín está muy nerfeado: en **~60% de las salas** aparece **un solo recogible** (casi siempre una moneda; corazón o llave son raros) y el resto no suelta nada. Además, con poca frecuencia, puede salir un **cofre**:
  - **Cofre gratis** 🎁 (raro): suelta monedas y, a veces, un corazón o una llave; **muy rara vez** (≈5%) guarda un objeto.
  - **Cofre dorado** ✨ (muy raro, cuesta **1 llave**): el mejor botín del juego, con **un objeto garantizado** (a veces dos), muchas monedas, un corazón y a veces una llave. La sala del **tesoro** siempre trae además un cofre gratis.
- **Los objetos de los cofres NO van directos al inventario**: aparecen sobre un **pedestal sellado** (con su cooldown, igual que la recompensa del jefe) y hay que acercarse para tomarlos.
- **Sellado al aparecer**: lo que acaba de generarse (botín al despejar, cofres) no se puede coger durante un instante (~1 s). La **recompensa del jefe** (objeto, llave y trampilla) sale **sellada 2 s** con un **contador visible** encima antes de poder recogerla o bajar de piso.
- Enemigos: `fly` (mosca), `gaper`, `charger` (embiste), `spitter` (escupe), `hopper` (salta), `fat` (gordo, se divide), **`ghost`** (espectro que **atraviesa obstáculos**) y **`sniper`** (francotirador que dispara de lejos). **Cada enemigo tiene su propia silueta** (mosca con alas translúcidas y ojos compuestos, cabeza que grita con bocaza y dientes, bestia con cuernos y cuatro patas, planta con túbulo y raíces, rana con patas y ojos saltones, barrigón con cabecita, sábana translúcida con cola ondulada y encapuchado con rifle) y, además, **cambia de aspecto según el piso** porque su paleta se mezcla con el color del tema. Hay **8 jefes** distintos, cada uno con patrón y estadísticas propias (ráfagas, embestidas, espirales, teletransporte, saltos, plumas, calaveras y aparición de esbirros). **Cada piso sortea su jefe entre al menos 3 posibles** (solo aparece uno). Los **jefes son el reto principal**, **avisan siempre antes de atacar** (aros, líneas de mira, abanicos…) para darte tiempo a reaccionar —ninguno embiste por sorpresa— y **disparan muchos más proyectiles**; siguen una **progresión clara**: suben **vida** (parten de 175 y crecen fuerte por piso), **velocidad**, **velocidad de sus balas** y **cadencia de ataque**; en los pisos **7 a 9** sus golpes (contacto y proyectiles) hacen **2 de daño** en vez de 1. La IA es más viva: los enemigos **anticipan tu movimiento** al perseguir y disparar, los que disparan **mantienen la distancia y serpentean**, y los cargadores (enemigos y jefes) **avisan antes de embestir** y quedan vulnerables un instante si fallan.
- **Botín de equipo**: recoge **corazones** (al curarte, curas a **todos**), **monedas** y **llaves** (compartidas por el grupo) y objetos de los pedestales.
- **Curaciones y resistencias más modestas**: los corazones curan menos, las regeneraciones son lentas, el robo de vida se acumula (medio corazón cada dos bajas) y la armadura está topada (como mucho 2 puntos). También hay **un dibujo distinto para cada uno de los ~50 objetos**.
- Hay **unos 50 objetos** repartidos en **5 niveles de rareza**: común, poco común, raro, épico y **legendario** (rarísimo). Unos afectan a daño, cadencia, velocidad, proyectil extra, balas perforantes/rebotantes/teledirigidas, armadura, regeneración, escudo, vidas extra, robo de vida… y a la **Brújula** y el **Mapa del piso**.
- **Los objetos son del equipo**: en cuanto uno los coge, los comparten todos los jugadores. **Los personajes caídos se quedan fuera** del reparto: no reciben los objetos que el equipo recoja mientras están muertos (sí conservan los que ya tenían). Con la tecla **`Tab`** (mantener) ves un panel con todas las mejoras; pasa el ratón por encima para leer qué hacen y cómo se combinan (esto solo lo ve quien pulsa la tecla).
- Otros objetos dan **habilidades únicas**: fuego, veneno, hielo, explosiones, rayos en cadena, bumerán, **moscas familiares** que orbitan, imán de monedas, golpe cargado, espinas que devuelven daño, ráfaga doble, codicia y empuje.
- Las habilidades **sinergizan** entre sí (12 combinaciones): fuego + veneno = «Nube tóxica ardiente», explosión + rebotes = «Metralla», hielo + perforante = «Escarcha cortante», cadena + teledirigido = «Tormenta dirigida», y más. El globo anticipa las sinergias con **⚡ Sinergia** antes de coger el objeto.
- Al acercarte a un pedestal aparece un **globo** con el nombre, la rareza y lo que suma o resta el objeto (y el precio, si es de la tienda).
- **Personajes**: hay **14 personajes** con estadísticas distintas, una **pasiva** siempre activa y una **habilidad activa** de **una sola carga** (nunca acumula más de una). Las activas se **recargan únicamente eliminando enemigos**: cada personaje pide un número distinto de **bajas** (desde **5** —Cartógrafo— hasta **25** —Sanación—, pasando por valores intermedios; las bajas cuentan para todo el equipo). **No hay recarga por tiempo ni al limpiar salas**: la barra de la habilidad solo sube matando. Pulsa `Espacio` para usarla. (Por ejemplo, **Tanque Santa** no regenera: tiene un **15% de curarse un corazón al limpiar** una sala.)
- **Selección de personaje**: al empezar (solo u online) eliges personaje en un panel en dos columnas; los **bloqueados salen en gris** y, al seleccionar uno, ves a la derecha su **pasiva**, **activa** y **cómo desbloquearlo**. La estética es **pixel art** (tipografía *Press Start 2P*, marcos y botones con bordes duros); los **personajes tienen la cabeza redonda** con el cuerpo en bloques y **los iconos de selección muestran esa misma cara redonda** (con sus ojos, boca y accesorio), los **enemigos tienen siluetas propias** que **cambian según el piso** y los **jefes** tienen **siluetas propias** (pinchos, cuerno, vórtice, espectro, baboso, serafín, cráneo y colmena) en vez de la antigua «pelota con cara».
- **Zona de pruebas**: en la **galería de Personajes** hay un botón al pie (**🧪 Zona de pruebas**) que abre una **sala vacía** con un **muñeco de práctica**. En la barra de la izquierda eliges con el ratón **cualquier personaje** (aunque esté bloqueado) y, encima de la barra, tienes un botón para **volver a Personajes**. Muévete con `WASD`, dispara con las flechas, usa la **habilidad activa** con `Espacio` y verás el **daño por impacto** del personaje (número flotante, daño total y DPS) sin afectar a tu partida. El panel muestra las **cargas de la activa** (lista o recargando, con las **bajas** que faltan) y el **buff temporal** que apliques.
- **Reanimaciones (solo online)**: en una partida **online (2 a 4 jugadores)** los personajes caídos **reviven al derrotar al jefe del piso**, con **la mitad de su vida máxima** (mínimo 2 corazones) y aparecen en el centro de la sala. **En solitario no hay reanimación**: si caes, se acaba la partida. Los objetos **Vida extra** y **Pluma de fénix** siguen existiendo (la pluma solo aparece en la tienda).
- Derrota al jefe, baja por la **trampilla** y repite en los pisos 2 a 9. Al superar el piso 9, **¡victoria!**

### Progreso permanente (meta)

Además de la partida, tu **progreso permanente** se guarda en el navegador. **Ya no hay monedas de progreso**: los **personajes** se desbloquean cumpliendo **cosas concretas** dentro de las partidas. Cada personaje bloqueado muestra en su ficha **cómo conseguirlo**:

- **Llegar a cierto piso** (p. ej. Caín al piso 2, Sansón al 5), **derrotar jefes** (Judas: 1; Lilit: 3) o **acumular bajas** (Diablillo: 250).
- **Ganar la partida** (superar los 9 pisos) para el **Olvidado**.
- **Conseguir logros** (Vigilante: 10).
- **Completar un desafío** (ver abajo): **Robot**, **Fantasma**, **Edén** y **Ángel**.

La **galería de Personajes** muestra a los bloqueados **en gris**; al seleccionar uno se abre a la derecha su ficha con **pasiva**, **activa** y **desbloqueo**. Desde ahí también se abre la **Zona de pruebas** para medir el daño de cualquier personaje contra un muñeco.

La pestaña **Desafíos** lista partidas con **reglas especiales** (p. ej. sin objetos, a un solo corazón, enemigos más rápidos o activa deshabilitada). Desafío = **superar los 9 pisos** con ese modificador; al lograrlo desbloqueas un personaje. Por ahora los desafíos son **solo en partidas en solitario**.

- Los **logros** se conceden una sola vez y aparecen como **avisos abajo a la izquierda**.
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
   git commit -m "Roguelike Arena: prototipo inicial"
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
│   ├── challenges.js   # Desafíos: modificadores de partida y personaje que desbloquean
│   ├── meta.js         # Progreso persistente: personajes, desafíos y logros (localStorage)
│   ├── input.js        # Teclado: movimiento, disparo y habilidad por esquema de control
│   ├── entities.js     # Fábricas y tablas de jugadores, enemigos, balas y objetos
│   ├── dungeon.js      # Generación determinista de pisos, temas y plan de enemigos
│   ├── render.js       # Renderizado en Canvas 2D y HUD (corazones, minimapa, habilidad)
│   ├── net.js          # Capa de red sobre PeerJS (anfitrión/cliente, envío, difusión)
│   ├── game.js         # Simulación, reglas, serialización de estado e interpolación
│   ├── preview.js      # Zona de pruebas: sala vacía con muñeco y daño por impacto
│   └── main.js         # Interfaz, menús (personajes/desafíos/progreso), bucle principal y red
└── .nojekyll           # Evita el procesado de Jekyll en GitHub Pages
```

Se usan etiquetas `<script>` clásicas (sin módulos ES) para que el juego también funcione abriendo el archivo directamente desde el disco. No hace falta instalar nada ni compilar.

---

## 🧪 Salud del proyecto

- La simulación y el renderizado están verificados con un conjunto de pruebas sin navegador (Node): generación de calabozo determinista, **variedad de diseños de sala**, transiciones de puerta y **temas por piso** (los **9 suelos y muros** con su decoración propia), **todos los enemigos dibujados en cada piso** (siluetas propias y tinte del tema), progresión completa (pisos → jefe → trampilla → victoria), objetos y rarezas, **habilidades únicas y sinergias** (fuego/veneno con daño con el tiempo, explosión en área, rayo en cadena, moscas familiares, imán, espinas, codicia, bumerán, empuje, serialización del estado de los enemigos y globo con sinergias), **recompensa al despejar salas y cofres (normales y dorados)**, **nueva IA y enemigos (espectro, francotirador)**, cerraduras con llave, patrones de jefe, globo de objetos, ausencia de excepciones y una prueba de integración de la interfaz.
- Una prueba de la **ronda 10** cubre el **nerfeo del botín** (≈60% de las salas con un único recogible, cofres raros y **cofres dorados muy raros** que cuestan una llave y garantizan un objeto **en un pedestal sellado**, no directo al inventario), las **activas con una sola carga** y su **recarga SOLO por enemigos eliminados** (requisitos de 5 a 25 bajas, el contador se reinicia al cargar, el tiempo **no** recarga y **limpiar salas tampoco**), la **cara redonda reutilizable** de los iconos de selección (`drawFace`) y que el **cofre dorado** se dibuja sin errores. Otra prueba comprueba que **tienda y tesoro siempre piden llave**, que sus **marcos son distintos** (`doorKinds`: «shop» verde / «treasure» dorado, en ambas caras del vano) y que el **jefe sigue siendo alcanzable** sin cruzar ninguna puerta con llave.
- También se prueban el **equilibrio y el contenido nuevos**: el **sellado al aparecer** (botín ~1 s y recompensa de jefe 2 s con contador), las **bolsas de jefes por piso** (≥3 candidatos, uno al azar y determinista), la **progresión y el endurecimiento de los jefes** (vida, velocidad, cadencia y daño 2 en pisos 7-9), los **enemigos propios de cada piso** y la **pasiva de Tanque Santa**.
- Y, en una prueba aparte, la **puerta del jefe con su marco propio** (marcada en ambas caras del vano), la **hitbox del jugador sobre el torso** (radio 6, **circulito relleno**) y la **visualización de hitboxes** con la tecla **`H`** (enemigos y proyectiles cercanos muestran su caja de colisión; los lejanos no; la marca del jugador se oculta y se vuelve a mostrar).
- Una prueba de la **ronda 4** cubre además la **puerta del jefe**, los **enemigos completamente distintos piso a piso** (ningún piso repite tipos del anterior; los esbirros del jefe salen del piso), el **telegrafiado de los jefes** (todos avisan antes de su primer ataque, el cargador nunca embiste sin su línea de mira, y todos disparan más proyectiles de tamaño normal) y la **hitbox pequeña y rellena**.
- Una prueba de la **ronda 5** cubre los **nombres descriptivos** de los personajes (ninguno conserva su nombre original), el **nombre genérico del juego**, las **reanimaciones solo online** (en solitario no hay; en online reviven al derrotar al jefe, a media vida) y que **los personajes caídos no reciben los objetos** recogidos por el equipo mientras están muertos. Además, una prueba de la **Zona de pruebas** abre la sala, elige personaje con el ratón, dispara al muñeco, **usa la habilidad activa** (consume carga, daña al muñeco y aplica sus buffs) y comprueba que se registra el **daño por impacto** sin romper la partida al volver.
- También se prueban los **personajes** (activa, pasiva y estadísticas), el **progreso persistente** (desbloqueo por retos y desafíos, logros y avisos, borrado selectivo y total, persistencia), los **desafíos** (modificadores aplicados), los **objetos compartidos**, las **reanimaciones** y el **panel de mejoras**.
- El protocolo de red (anfitrión y cliente) también está cubierto con un PeerJS simulado: *hello/welcome*, lobby, *start*, instantáneas de estado, `ping/pong`, jugador que entra/sale, sala llena y fin de partida.

---

## 📝 Notas

- Proyecto **educativo/prototipo** original.
- Todo el arte se dibuja por código sobre el `<canvas>` y el sonido se sintetiza con WebAudio, así que no hay recursos binarios externos.
