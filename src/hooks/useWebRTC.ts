import { useEffect, useRef, useState } from 'react';
import { db, auth } from '../firebase';
import { collection, doc, onSnapshot, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { Signal } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

export function useWebRTC(callId: string | null) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<{ [uid: string]: MediaStream }>({});
  const peerConnections = useRef<{ [uid: string]: RTCPeerConnection }>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  useEffect(() => {
    if (!callId || !auth.currentUser) return;

    const setupLocalStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
      } catch (err) {
        console.error('Error accessing microphone:', err);
      }
    };

    setupLocalStream();

    return () => {
      localStreamRef.current?.getTracks().forEach(track => track.stop());
      Object.values(peerConnections.current).forEach((pc: RTCPeerConnection) => pc.close());
      peerConnections.current = {};
    };
  }, [callId]);

  useEffect(() => {
    if (!callId || !auth.currentUser || !localStream) return;

    const signalsRef = collection(db, 'calls', callId, 'signals');
    const q = query(signalsRef, where('to', '==', auth.currentUser.uid));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added') {
          const signal = change.doc.data() as Signal;
          await handleSignal(signal, change.doc.id);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `calls/${callId}/signals`));

    return () => unsubscribe();
  }, [callId, localStream]);

  const createPeerConnection = (uid: string) => {
    const pc = new RTCPeerConnection(iceServers);

    pc.onicecandidate = (event) => {
      if (event.candidate && auth.currentUser && callId) {
        addDoc(collection(db, 'calls', callId, 'signals'), {
          from: auth.currentUser.uid,
          to: uid,
          type: 'candidate',
          data: JSON.stringify(event.candidate),
          timestamp: new Date().toISOString(),
        }).catch(err => handleFirestoreError(err, OperationType.WRITE, `calls/${callId}/signals`));
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({
        ...prev,
        [uid]: event.streams[0],
      }));
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnections.current[uid] = pc;
    return pc;
  };

  const handleSignal = async (signal: Signal, signalId: string) => {
    if (!callId || !auth.currentUser) return;

    let pc = peerConnections.current[signal.from];
    if (!pc) pc = createPeerConnection(signal.from);

    if (signal.type === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.data)));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      try {
        await addDoc(collection(db, 'calls', callId, 'signals'), {
          from: auth.currentUser.uid,
          to: signal.from,
          type: 'answer',
          data: JSON.stringify(answer),
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `calls/${callId}/signals`);
      }
    } else if (signal.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(signal.data)));
    } else if (signal.type === 'candidate') {
      await pc.addIceCandidate(new RTCIceCandidate(JSON.parse(signal.data)));
    }

    try {
      await deleteDoc(doc(db, 'calls', callId, 'signals', signalId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `calls/${callId}/signals/${signalId}`);
    }
  };

  const initiateCall = async (targetUid: string) => {
    if (!callId || !auth.currentUser || !localStream) return;

    const pc = createPeerConnection(targetUid);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    try {
      await addDoc(collection(db, 'calls', callId, 'signals'), {
        from: auth.currentUser.uid,
        to: targetUid,
        type: 'offer',
        data: JSON.stringify(offer),
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `calls/${callId}/signals`);
    }
  };

  return { localStream, remoteStreams, initiateCall };
}
