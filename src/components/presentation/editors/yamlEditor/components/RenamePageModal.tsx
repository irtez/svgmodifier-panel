import React, { useEffect, useState } from 'react';
import { Button, Input, Modal } from '@grafana/ui';

interface RenamePageModalProps {
  isOpen: boolean;
  currentName: string;
  onDismiss: () => void;
  onConfirm: (newName: string) => void;
}

export const RenamePageModal: React.FC<RenamePageModalProps> = ({ isOpen, currentName, onDismiss, onConfirm }) => {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
    }
  }, [isOpen, currentName]);

  return (
    <Modal title="Rename page" isOpen={isOpen} onDismiss={onDismiss}>
      <Input value={name} onChange={(e) => setName(e.currentTarget.value)} autoFocus />
      <Modal.ButtonRow>
        <Button variant="secondary" onClick={onDismiss}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => onConfirm(name)}>
          Save
        </Button>
      </Modal.ButtonRow>
    </Modal>
  );
};
