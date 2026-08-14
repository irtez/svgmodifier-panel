import React, { useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTheme2 } from '@grafana/ui';
import { PanelOptions } from 'types';
import { usePortal } from './hooks/usePortal';
import { useAutoScroll } from './hooks/useAutoScroll';
import { useTooltipPosition } from './hooks/useTooltipPosition';
import { useAdaptiveWidth } from './hooks/useAdaptiveWidth';
import { injectHideScrollbarStyle } from './utils/injectGlobalStyles';
import { getContainerStyles, getTitleStyles, getListStyles } from './styles';

export interface NotificationTooltipProps {
  count?: number;
  dataSourceNames?: string[];
  show: boolean;
  options?: PanelOptions['notifyTooltip'];
  containerRef?: React.RefObject<HTMLElement>;
}

export const NotificationTooltip = React.memo<NotificationTooltipProps>(
  ({ count = 0, dataSourceNames = [], show, options = {}, containerRef }) => {
    const theme = useTheme2();
    const { offsetX = 19, offsetY = 146, hideInEditMode = true } = options;
    const isEditing = window.location.search.includes('editPanel=');
    const isVisible = show && !(hideInEditMode && isEditing);

    useLayoutEffect(() => {
      injectHideScrollbarStyle();
    }, []);

    const portalRef = usePortal();
    const position = useTooltipPosition(containerRef, offsetX, offsetY, isVisible);
    const { textRef, tooltipWidth, needsScroll } = useAdaptiveWidth(isVisible, dataSourceNames);

    useAutoScroll(textRef, needsScroll, dataSourceNames);

    if (!isVisible || !portalRef.current) {
      return null;
    }

    const content = (
      <div style={{ position: 'fixed', left: position.left, top: position.top, transition: 'none' }}>
        <div style={getContainerStyles(theme, tooltipWidth)}>
          {dataSourceNames.length > 0 && (
            <>
              <div style={getTitleStyles(theme)}>Затронуто: {count} ФП</div>
              <div ref={textRef} style={getListStyles(theme, needsScroll)} className="hide-scrollbar">
                {dataSourceNames.map((name, idx) => (
                  <span key={idx} style={{ display: 'inline-block', whiteSpace: 'normal', marginRight: '8px' }}>
                    <strong style={{ color: theme.colors.text.primary, fontWeight: 'bold' }}>{idx + 1}.</strong> {name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );

    return ReactDOM.createPortal(content, portalRef.current);
  }
);

NotificationTooltip.displayName = 'NotificationTooltip';
