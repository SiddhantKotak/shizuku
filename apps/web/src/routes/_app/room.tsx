import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/room')({
  component: RoomPage,
});

function RoomPage(): React.JSX.Element {
  // TODO(week-3-4): mount <RoomCanvas /> with Phaser BootScene + RoomScene
  // and overlay <RoomHUD /> with streak/level/Ink/quest button.
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="font-pixel text-3xl">Your Private Study</h1>
        <p className="mt-2 text-sm text-ink/70">
          Phaser canvas mounts here in week 3 of the sprint plan.
        </p>
      </div>
    </div>
  );
}
