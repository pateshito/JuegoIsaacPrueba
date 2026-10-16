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

El juego utiliza una arquitectura **Host-Client** sobre **WebRTC** (gracias a [PeerJS](https://peerjs.com/)). 
- **No hay servidor de juego propio:** Los datos viajan directamente entre los navegadores de los jugadores.
- **El Anfitrión (Host) es autoritativo:** Simula la partida (enemigos, colisiones, drops) y envía el estado a los clientes.
- **Unirse fácilmente:** El anfitrión genera un código de 4 letras. Los demás solo deben pulsar "Unirse a sala" e introducirlo. ¡Se puede entrar con la partida en marcha!
