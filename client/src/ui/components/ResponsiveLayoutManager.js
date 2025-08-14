/**
 * ResponsiveLayoutManager - Handles responsive design and mobile features
 */
export class ResponsiveLayoutManager {
    constructor(elements) {
        this.elements = elements;
        this.isMobile = window.innerWidth <= 768;
        this.setupHandlers();
    }

    setupHandlers() {
        const handleResize = () => {
            const wasMobile = this.isMobile;
            this.isMobile = window.innerWidth <= 768;
            
            if (wasMobile !== this.isMobile) {
                this.updateMobileLayout();
            }
            
            this.updateTouchTargets();
        };

        const handleOrientationChange = () => {
            setTimeout(() => {
                this.updateMobileLayout();
                this.handleOrientationSpecificLayout();
                this.updateTouchTargets();
                document.body.offsetHeight;
            }, 150);
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('orientationchange', handleOrientationChange);
        
        if (screen.orientation) {
            screen.orientation.addEventListener('change', handleOrientationChange);
        }

        const handleViewportChange = () => {
            if (this.isMobile) {
                this.adjustForViewportChanges();
            }
        };

        window.addEventListener('resize', handleViewportChange);
        
        this.resizeHandler = handleResize;
        this.orientationHandler = handleOrientationChange;
        this.viewportHandler = handleViewportChange;
    }

    updateMobileLayout() {
        const container = document.querySelector('.waiting-room-container');
        const body = document.body;
        
        if (this.isMobile) {
            container?.classList.add('mobile-layout');
            body.classList.add('mobile-device');
            
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '1fr';
            }
            
            this.enableMobileFeatures();
        } else {
            container?.classList.remove('mobile-layout');
            body.classList.remove('mobile-device');
            
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '';
            }
            
            this.disableMobileFeatures();
        }
        
        this.updateTouchTargets();
    }

    handleOrientationSpecificLayout() {
        if (!this.isMobile) return;

        const isLandscape = window.innerWidth > window.innerHeight;
        const container = document.querySelector('.waiting-room-container');
        
        if (isLandscape) {
            container?.classList.add('landscape-mode');
            container?.classList.remove('portrait-mode');
            
            const playersGrid = this.elements.playersGrid;
            if (playersGrid && window.innerWidth >= 640) {
                playersGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            }
        } else {
            container?.classList.add('portrait-mode');
            container?.classList.remove('landscape-mode');
            
            const playersGrid = this.elements.playersGrid;
            if (playersGrid) {
                playersGrid.style.gridTemplateColumns = '1fr';
            }
        }
    }

    updateTouchTargets() {
        const touchElements = [
            this.elements.copyCodeBtn,
            this.elements.startGameBtn,
            document.getElementById('leave-room-btn'),
            document.getElementById('close-error-btn'),
            document.getElementById('error-ok-btn')
        ];

        touchElements.forEach(element => {
            if (element) {
                const computedStyle = window.getComputedStyle(element);
                const currentHeight = parseInt(computedStyle.height);
                const currentWidth = parseInt(computedStyle.width);
                
                if (currentHeight < 44) {
                    element.style.minHeight = '44px';
                }
                if (currentWidth < 44) {
                    element.style.minWidth = '44px';
                }
                
                element.classList.add('touch-target');
            }
        });

        Object.values(this.elements.playerSlots).forEach(slot => {
            if (slot) {
                slot.classList.add('touch-friendly');
            }
        });
    }

    enableMobileFeatures() {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 
                'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
            );
        }

        this.addMobileEventListeners();
        this.enableSwipeGestures();
    }

    disableMobileFeatures() {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
            viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
        }

        this.removeMobileEventListeners();
        this.disableSwipeGestures();
    }

    addMobileEventListeners() {
        const buttons = document.querySelectorAll('.btn, .copy-btn');
        buttons.forEach(button => {
            button.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
            button.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        });

        buttons.forEach(button => {
            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                button.click();
            });
        });
    }

    removeMobileEventListeners() {
        const buttons = document.querySelectorAll('.btn, .copy-btn');
        buttons.forEach(button => {
            button.removeEventListener('touchstart', this.handleTouchStart);
            button.removeEventListener('touchend', this.handleTouchEnd);
        });
    }

    handleTouchStart(e) {
        if (e.currentTarget && e.currentTarget.classList) {
            e.currentTarget.classList.add('touch-active');
        }
    }

    handleTouchEnd(e) {
        setTimeout(() => {
            if (e.currentTarget && e.currentTarget.classList) {
                e.currentTarget.classList.remove('touch-active');
            }
        }, 150);
    }

    enableSwipeGestures() {
        let startX = 0;
        let startY = 0;
        
        const handleTouchStart = (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        };
        
        const handleTouchEnd = (e) => {
            if (!startX || !startY) return;
            
            const endX = e.changedTouches[0].clientX;
            const endY = e.changedTouches[0].clientY;
            
            const diffX = startX - endX;
            const diffY = startY - endY;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
                if (diffX > 0) {
                    console.log('[ResponsiveLayoutManager] Swipe left detected');
                } else {
                    console.log('[ResponsiveLayoutManager] Swipe right detected');
                }
            }
            
            startX = 0;
            startY = 0;
        };
        
        document.addEventListener('touchstart', handleTouchStart, { passive: true });
        document.addEventListener('touchend', handleTouchEnd, { passive: true });
        
        this.swipeStartHandler = handleTouchStart;
        this.swipeEndHandler = handleTouchEnd;
    }

    disableSwipeGestures() {
        if (this.swipeStartHandler) {
            document.removeEventListener('touchstart', this.swipeStartHandler);
        }
        if (this.swipeEndHandler) {
            document.removeEventListener('touchend', this.swipeEndHandler);
        }
    }

    adjustForViewportChanges() {
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.clientHeight;
        
        const keyboardOpen = viewportHeight < documentHeight * 0.75;
        
        const container = document.querySelector('.waiting-room-container');
        if (container) {
            if (keyboardOpen) {
                container.classList.add('keyboard-open');
            } else {
                container.classList.remove('keyboard-open');
            }
        }
    }

    cleanup() {
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.orientationHandler) {
            window.removeEventListener('orientationchange', this.orientationHandler);
            if (screen.orientation) {
                screen.orientation.removeEventListener('change', this.orientationHandler);
            }
        }
        if (this.viewportHandler) {
            window.removeEventListener('resize', this.viewportHandler);
        }
        
        this.removeMobileEventListeners();
        this.disableSwipeGestures();
    }
}