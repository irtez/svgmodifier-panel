import React from 'react';
import { Button, Modal } from '@grafana/ui';

interface DeletePageModalProps {
  isOpen: boolean;
  pageName: string | undefined;
  onDismiss: () => void;
  onConfirm: () => void;
}

export const DeletePageModal: React.FC<DeletePageModalProps> = ({ isOpen, pageName, onDismiss, onConfirm }) => (
  <Modal title="Delete page" isOpen={isOpen} onDismiss={onDismiss}>
    <p>{`Are you sure you want to delete "${pageName}"?`}</p>
    <Modal.ButtonRow>
      <Button variant="secondary" onClick={onDismiss}>
        Cancel
      </Button>
      <Button variant="destructive" onClick={onConfirm}>
        Delete
      </Button>
    </Modal.ButtonRow>
  </Modal>
);
