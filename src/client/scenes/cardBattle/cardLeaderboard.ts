import * as Phaser from 'phaser';

export function showCardLeaderboard(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const bgWidth = Math.min(width * 0.92, 460);
  const bgHeight = 440;

  const responsiveRoot = scene.add.container(width / 2, height / 2).setDepth(500);
  const lbContainer = scene.add.container(0, 0).setScale(0);
  responsiveRoot.add(lbContainer);
  let responsiveScale = 1;
  let maskGraphics: Phaser.GameObjects.Graphics | null = null;
  let maskViewport: { x: number; y: number; width: number; height: number } | null = null;
  const resizeLeaderboard = (size: { width: number; height: number }): void => {
    responsiveScale = Math.min(
      1,
      Math.max(0.45, (size.width - 16) / bgWidth),
      Math.max(0.45, (size.height - 16) / bgHeight)
    );
    responsiveRoot.setPosition(size.width / 2, size.height / 2).setScale(responsiveScale);
    if (maskGraphics && maskViewport) {
      maskGraphics.clear();
      maskGraphics.fillStyle(0xffffff);
      maskGraphics.fillRect(
        size.width / 2 + maskViewport.x * responsiveScale,
        size.height / 2 + maskViewport.y * responsiveScale,
        maskViewport.width * responsiveScale,
        maskViewport.height * responsiveScale
      );
    }
  };
  resizeLeaderboard({ width: scene.scale.width, height: scene.scale.height });
  scene.scale.on('resize', resizeLeaderboard);
  scene.events.once('shutdown', () => scene.scale.off('resize', resizeLeaderboard));

  // Background
  const lbBg = scene.add.graphics();
  lbBg.fillStyle(0x0c071d, 0.95);
  lbBg.lineStyle(3, 0x00ffee, 1.0);
  lbBg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 12);
  lbBg.strokeRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, 12);
  lbContainer.add(lbBg);

  // Title
  const titleText = scene.add
    .text(0, -bgHeight / 2 + 35, '🏆 BATTLE RANKINGS', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#00ffee',
    })
    .setOrigin(0.5);
  lbContainer.add(titleText);

  // Current player's battle summary
  const statsTop = -bgHeight / 2 + 58;
  const statsHeight = 76;
  const statsBg = scene.add.graphics();
  statsBg.fillStyle(0x11152b, 0.98);
  statsBg.lineStyle(1.5, 0x00ffee, 0.85);
  statsBg.fillRoundedRect(-bgWidth / 2 + 18, statsTop, bgWidth - 36, statsHeight, 7);
  statsBg.strokeRoundedRect(-bgWidth / 2 + 18, statsTop, bgWidth - 36, statsHeight, 7);

  const rankStat = scene.add.text(-bgWidth / 2 + 32, statsTop + 21, 'MY RANK --', {
    fontFamily: 'monospace', fontSize: '13px', color: '#00ffee', fontStyle: 'bold',
  }).setOrigin(0, 0.5);
  const scoreStat = scene.add.text(0, statsTop + 21, 'SCORE 0', {
    fontFamily: 'monospace', fontSize: '13px', color: '#ffbb00', fontStyle: 'bold',
  }).setOrigin(0.5);
  const xpStat = scene.add.text(bgWidth / 2 - 32, statsTop + 21, 'XP 0', {
    fontFamily: 'monospace', fontSize: '13px', color: '#39ff14', fontStyle: 'bold',
  }).setOrigin(1, 0.5);
  const handStat = scene.add.text(-bgWidth / 2 + 32, statsTop + 54, 'BEST HAND 0', {
    fontFamily: 'monospace', fontSize: '12px', color: '#ffffff',
  }).setOrigin(0, 0.5);
  const multStat = scene.add.text(bgWidth / 2 - 32, statsTop + 54, 'MAX MULT x1.0', {
    fontFamily: 'monospace', fontSize: '12px', color: '#ff00ff',
  }).setOrigin(1, 0.5);
  lbContainer.add([statsBg, rankStat, scoreStat, xpStat, handStat, multStat]);

  // Table Headers
  const headerY = -bgHeight / 2 + 148;
  const headerRank = scene.add
    .text(-bgWidth / 2 + 40, headerY, 'RANK', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#888888',
    })
    .setOrigin(0, 0.5);
  const headerPlayer = scene.add
    .text(-bgWidth / 2 + 100, headerY, 'PLAYER', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#888888',
    })
    .setOrigin(0, 0.5);
  const headerScore = scene.add
    .text(bgWidth / 2 - 40, headerY, 'SCORE', {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#888888',
    })
    .setOrigin(1, 0.5);
  lbContainer.add([headerRank, headerPlayer, headerScore]);

  // Add a loading text
  const loadingText = scene.add
    .text(0, 0, 'LOADING RANKINGS...', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  lbContainer.add(loadingText);

  // Show leaderboard container with animation
  scene.tweens.add({
    targets: lbContainer,
    scale: 1.0,
    duration: 400,
    ease: 'Back.easeOut',
  });

  type LeaderboardResponse = {
    status: string;
    username?: string;
    leaderboard?: { rank: number; username: string; score: number }[];
    playerStats?: {
      rank: number;
      score: number;
      xp: number;
      highestHand: number;
      highestMult: number;
    } | null;
  };

  // Fetch the card leaderboard
  fetch('/api/card-leaderboard')
    .then((res) => res.json())
    .then((data: LeaderboardResponse) => {
      if (!lbContainer.active) return;
      loadingText.destroy();

      if (data.status !== 'success' || !data.leaderboard) {
        const errText = scene.add
          .text(0, 0, 'FAILED TO LOAD RANKINGS', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#ff0055',
          })
          .setOrigin(0.5);
        lbContainer.add(errText);
        return;
      }

      const leaderboard = data.leaderboard;
      const currentUsername = data.username || '';
      const playerStats = data.playerStats;
      if (playerStats) {
        rankStat.setText(`MY RANK #${playerStats.rank}`);
        scoreStat.setText(`SCORE ${playerStats.score.toLocaleString()}`);
        xpStat.setText(`XP ${playerStats.xp.toLocaleString()}`);
        handStat.setText(`BEST HAND ${playerStats.highestHand.toLocaleString()}`);
        multStat.setText(`MAX MULT x${playerStats.highestMult.toFixed(1)}`);
      }

      // Viewport dimensions
      const vpX = -bgWidth / 2 + 20;
      const vpY = -bgHeight / 2 + 163;
      const vpW = bgWidth - 40;
      const vpH = 192;

      // Mask
      maskGraphics = scene.add.graphics();
      maskGraphics.fillStyle(0xffffff);
      maskViewport = { x: vpX, y: vpY, width: vpW, height: vpH };
      resizeLeaderboard({ width: scene.scale.width, height: scene.scale.height });
      const geomMask = maskGraphics.createGeometryMask();
      maskGraphics.setVisible(false); // Hide the mask graphic itself

      // List Container
      const listContainer = scene.add.container(0, vpY);
      listContainer.setMask(geomMask);
      lbContainer.add(listContainer);

      const rowHeight = 36;
      let playerRowIndex = -1;

      leaderboard.forEach((entry, idx) => {
        const rowY = idx * rowHeight + rowHeight / 2;
        const isPlayer = entry.username.toLowerCase() === currentUsername.toLowerCase();
        if (isPlayer) {
          playerRowIndex = idx;
        }

        // Row background highlight for player
        if (isPlayer) {
          const rowBg = scene.add.graphics();
          rowBg.fillStyle(0x00ffee, 0.15);
          rowBg.lineStyle(1.5, 0x00ffee, 0.8);
          rowBg.fillRoundedRect(vpX + 10, rowY - rowHeight / 2 + 2, vpW - 20, rowHeight - 4, 4);
          rowBg.strokeRoundedRect(vpX + 10, rowY - rowHeight / 2 + 2, vpW - 20, rowHeight - 4, 4);
          listContainer.add(rowBg);
        }

        const textColor = isPlayer ? '#00ffee' : '#ffffff';

        const rankTxt = scene.add
          .text(vpX + 25, rowY, `#${entry.rank}`, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: textColor,
            fontStyle: isPlayer ? 'bold' : 'normal',
          })
          .setOrigin(0, 0.5);

        const nameTxt = scene.add
          .text(vpX + 80, rowY, entry.username, {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: textColor,
            fontStyle: isPlayer ? 'bold' : 'normal',
          })
          .setOrigin(0, 0.5);

        const scoreTxt = scene.add
          .text(vpX + vpW - 25, rowY, entry.score.toLocaleString(), {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: isPlayer ? '#ffbb00' : textColor,
            fontStyle: isPlayer ? 'bold' : 'normal',
          })
          .setOrigin(1, 0.5);

        listContainer.add([rankTxt, nameTxt, scoreTxt]);
      });

      // Calculate and run scroll animation to center the player
      if (playerRowIndex !== -1) {
        const totalListHeight = leaderboard.length * rowHeight;

        let targetListY = vpY + vpH / 2 - (playerRowIndex * rowHeight + rowHeight / 2);

        // Clamp targetListY so it doesn't scroll out of bounds
        const minY = vpY - Math.max(0, totalListHeight - vpH);
        const maxY = vpY;
        targetListY = Phaser.Math.Clamp(targetListY, minY, maxY);

        // Initially keep list at maxY (the top of list aligned with top of viewport)
        listContainer.y = maxY;

        // Quick scroll animation after a short delay
        scene.time.delayedCall(500, () => {
          if (!scene.sys.isActive() || !listContainer.active) return;
          scene.tweens.add({
            targets: listContainer,
            y: targetListY,
            duration: 1500,
            ease: 'Cubic.easeInOut',
          });
        });
      }
    })
    .catch((err) => {
      console.error('Failed to load card leaderboard:', err);
      if (lbContainer.active) {
        loadingText.destroy();
        const errText = scene.add
          .text(0, 0, 'FAILED TO LOAD RANKINGS', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: '#ff0055',
          })
          .setOrigin(0.5);
        lbContainer.add(errText);
      }
    });

  // 2. Main Menu Button (Drawn natively in Phaser for perfect alignment)
  const mainMenuBtn = scene.add.container(bgWidth / 2 - 80, bgHeight / 2 - 40);
  const mainMenuBg = scene.add.graphics();
  mainMenuBg.fillStyle(0xffffff, 0.25);
  mainMenuBg.lineStyle(2, 0xffffff, 1.0);
  mainMenuBg.fillRoundedRect(-55, -20, 110, 40, 5);
  mainMenuBg.strokeRoundedRect(-55, -20, 110, 40, 5);
  mainMenuBtn.add(mainMenuBg);

  const mainMenuText = scene.add
    .text(0, 0, 'MAIN MENU', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#ffffff',
    })
    .setOrigin(0.5);
  mainMenuBtn.add(mainMenuText);

  lbContainer.add(mainMenuBtn);

  mainMenuBtn.setInteractive(
    new Phaser.Geom.Rectangle(-55, -20, 110, 40),
    Phaser.Geom.Rectangle.Contains
  );
  mainMenuBtn.on('pointerover', () => mainMenuBtn.setScale(1.06));
  mainMenuBtn.on('pointerout', () => mainMenuBtn.setScale(1.0));
  mainMenuBtn.on('pointerdown', () => {
    sessionStorage.setItem('skip_shared_battle_autostart', '1');
    window.location.href = 'splash.html';
  });
}
