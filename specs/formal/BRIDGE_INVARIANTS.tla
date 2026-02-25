------------------------------ MODULE BRIDGE_INVARIANTS ------------------------------
EXTENDS Naturals, Sequences, FiniteSets

CONSTANTS Msgs, Nonces, Channels, SourceChannel, MsgNonce, PolicyTargets

ASSUME Msgs # {}
ASSUME Nonces # {}
ASSUME Channels # {}
ASSUME SourceChannel \in [Msgs -> Channels]
ASSUME MsgNonce \in [Msgs -> Nonces]
ASSUME PolicyTargets \in [Channels -> SUBSET Channels]

VARIABLES pending, verified, processed, usedNonces, forwarded

Vars == <<pending, verified, processed, usedNonces, forwarded>>

Init ==
  /\ pending = {}
  /\ verified = {}
  /\ processed = {}
  /\ usedNonces = {}
  /\ forwarded = {}

Receive(m) ==
  /\ m \in Msgs
  /\ m \notin pending
  /\ MsgNonce[m] \notin usedNonces
  /\ pending' = pending \cup {m}
  /\ usedNonces' = usedNonces \cup {MsgNonce[m]}
  /\ UNCHANGED <<verified, processed, forwarded>>

ReplayDrop(m) ==
  /\ m \in Msgs
  /\ MsgNonce[m] \in usedNonces
  /\ UNCHANGED Vars

Verify(m) ==
  /\ m \in pending
  /\ verified' = verified \cup {m}
  /\ UNCHANGED <<pending, processed, usedNonces, forwarded>>

Ingest(m) ==
  /\ m \in verified
  /\ m \notin processed
  /\ processed' = processed \cup {m}
  /\ UNCHANGED <<pending, verified, usedNonces, forwarded>>

Forward(m, c) ==
  /\ m \in processed
  /\ c \in PolicyTargets[SourceChannel[m]]
  /\ forwarded' = forwarded \cup {<<m, c>>}
  /\ UNCHANGED <<pending, verified, processed, usedNonces>>

Next ==
  \E m \in Msgs:
    Receive(m) \/ ReplayDrop(m) \/ Verify(m) \/ Ingest(m) \/ (\E c \in Channels: Forward(m, c))

Spec == Init /\ [][Next]_Vars

AuthBeforeIngest == processed \subseteq verified

NoReplayAccept ==
  \A m1, m2 \in processed:
    m1 # m2 => MsgNonce[m1] # MsgNonce[m2]

ForwardPolicyBounded ==
  \A pair \in forwarded:
    LET m == pair[1] IN
    LET c == pair[2] IN
      c \in PolicyTargets[SourceChannel[m]]

THEOREM Spec => []AuthBeforeIngest
THEOREM Spec => []NoReplayAccept
THEOREM Spec => []ForwardPolicyBounded

=============================================================================
